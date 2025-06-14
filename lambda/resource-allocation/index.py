import json
import boto3
import os
from datetime import datetime

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')

# Get environment variables
EMERGENCY_TABLE = os.environ.get('EMERGENCY_TABLE')
RESOURCE_TABLE = os.environ.get('RESOURCE_TABLE')
RESOURCE_RECOMMENDATION_FUNCTION_ARN = os.environ.get('RESOURCE_RECOMMENDATION_FUNCTION_ARN')

# Initialize DynamoDB tables
emergency_table = dynamodb.Table(EMERGENCY_TABLE)
resource_table = dynamodb.Table(RESOURCE_TABLE)

def get_available_resources(resource_types):
    """
    Get available resources of the specified types
    """
    available_resources = []
    
    for resource_type in resource_types:
        # Query the resource table for available resources of this type
        response = resource_table.query(
            IndexName='ResourceTypeIndex',
            KeyConditionExpression='resource_type = :resource_type AND availability_status = :status',
            ExpressionAttributeValues={
                ':resource_type': resource_type,
                ':status': 'AVAILABLE'
            }
        )
        
        # Add the resources to our list
        available_resources.extend(response.get('Items', []))
    
    return available_resources

def allocate_resources(emergency_id, resources):
    """
    Allocate resources to the emergency
    """
    allocated_resources = []
    
    for resource in resources:
        resource_id = resource['resource_id']
        
        try:
            # Update the resource status to ALLOCATED
            resource_table.update_item(
                Key={
                    'resource_id': resource_id
                },
                UpdateExpression="set availability_status = :status, allocated_to = :emergency_id, allocation_timestamp = :timestamp",
                ExpressionAttributeValues={
                    ':status': 'ALLOCATED',
                    ':emergency_id': emergency_id,
                    ':timestamp': datetime.now().isoformat()
                },
                ConditionExpression="availability_status = :available",
                ExpressionAttributeValues={
                    ':available': 'AVAILABLE',
                    ':status': 'ALLOCATED',
                    ':emergency_id': emergency_id,
                    ':timestamp': datetime.now().isoformat()
                }
            )
            
            # Add to allocated resources
            allocated_resources.append(resource)
        
        except Exception as e:
            print(f"Error allocating resource {resource_id}: {str(e)}")
            # Continue with other resources
    
    return allocated_resources

def lambda_handler(event, context):
    """
    Main handler function for resource allocation
    """
    print(f"Received event: {json.dumps(event)}")
    
    try:
        # Get emergency ID from the event
        emergency_id = event['emergency_id']
        
        # Get the emergency details from DynamoDB
        response = emergency_table.get_item(
            Key={
                'emergency_id': emergency_id
            }
        )
        
        if 'Item' not in response:
            raise Exception(f"Emergency with ID {emergency_id} not found")
        
        emergency_data = response['Item']
        
        # Update emergency status to ALLOCATING_RESOURCES
        emergency_table.update_item(
            Key={
                'emergency_id': emergency_id
            },
            UpdateExpression="set #status = :status",
            ExpressionAttributeNames={
                '#status': 'status'
            },
            ExpressionAttributeValues={
                ':status': 'ALLOCATING_RESOURCES'
            }
        )
        
        # Get recommended resources from the emergency data
        recommended_resources = emergency_data.get('recommended_resources', [])
        
        # If no recommended resources, try to get them from the resource recommendation function
        if not recommended_resources and RESOURCE_RECOMMENDATION_FUNCTION_ARN:
            try:
                response = lambda_client.invoke(
                    FunctionName=RESOURCE_RECOMMENDATION_FUNCTION_ARN,
                    InvocationType='RequestResponse',
                    Payload=json.dumps(emergency_data)
                )
                
                recommendation_result = json.loads(response['Payload'].read())
                recommended_resources = recommendation_result.get('recommended_resources', [])
            except Exception as e:
                print(f"Error getting resource recommendations: {str(e)}")
                # Use default resources based on emergency type
                emergency_type = emergency_data['emergency_type']
                if emergency_type == 'NATURAL_DISASTER':
                    recommended_resources = ['emergency-response-team', 'medical-team']
                elif emergency_type == 'INFRASTRUCTURE_FAILURE':
                    recommended_resources = ['it-emergency-team', 'network-team']
                elif emergency_type == 'SECURITY_INCIDENT':
                    recommended_resources = ['security-team', 'forensics-team']
                else:
                    recommended_resources = ['emergency-response-team']
        
        # Get available resources of the recommended types
        available_resources = get_available_resources(recommended_resources)
        
        # Allocate resources to the emergency
        allocated_resources = allocate_resources(emergency_id, available_resources)
        
        # Update the emergency with allocated resources
        emergency_table.update_item(
            Key={
                'emergency_id': emergency_id
            },
            UpdateExpression="set #status = :status, allocated_resources = :allocated_resources, allocation_timestamp = :timestamp",
            ExpressionAttributeNames={
                '#status': 'status'
            },
            ExpressionAttributeValues={
                ':status': 'RESOURCES_ALLOCATED',
                ':allocated_resources': allocated_resources,
                ':timestamp': datetime.now().isoformat()
            }
        )
        
        # Return the allocation results
        return {
            'emergency_id': emergency_id,
            'status': 'RESOURCES_ALLOCATED',
            'allocated_resources': allocated_resources,
            'allocation_timestamp': datetime.now().isoformat()
        }
    
    except Exception as e:
        print(f"Error allocating resources: {str(e)}")
        
        # Update emergency status to ERROR if we have an emergency_id
        if 'emergency_id' in event:
            try:
                emergency_table.update_item(
                    Key={
                        'emergency_id': event['emergency_id']
                    },
                    UpdateExpression="set #status = :status, error_message = :error_message",
                    ExpressionAttributeNames={
                        '#status': 'status'
                    },
                    ExpressionAttributeValues={
                        ':status': 'RESOURCE_ALLOCATION_ERROR',
                        ':error_message': str(e)
                    }
                )
            except Exception as update_error:
                print(f"Error updating emergency status: {str(update_error)}")
        
        return {
            'error': str(e),
            'status': 'ERROR'
        }
