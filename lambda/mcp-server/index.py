import json
import boto3
import uuid
import os
from datetime import datetime

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
stepfunctions = boto3.client('stepfunctions')
events = boto3.client('events')

# Get environment variables
EMERGENCY_TABLE = os.environ.get('EMERGENCY_TABLE')
RESOURCE_TABLE = os.environ.get('RESOURCE_TABLE')
TEAM_TABLE = os.environ.get('TEAM_TABLE')
EVENT_BUS_NAME = os.environ.get('EVENT_BUS_NAME')

# Get workflow ARNs from environment variables
NATURAL_DISASTER_WORKFLOW_ARN = os.environ.get('NATURAL_DISASTER_WORKFLOW_ARN')
INFRASTRUCTURE_FAILURE_WORKFLOW_ARN = os.environ.get('INFRASTRUCTURE_FAILURE_WORKFLOW_ARN')
SECURITY_INCIDENT_WORKFLOW_ARN = os.environ.get('SECURITY_INCIDENT_WORKFLOW_ARN')

# Initialize DynamoDB tables
emergency_table = dynamodb.Table(EMERGENCY_TABLE)

# Emergency type to workflow mapping
WORKFLOW_MAPPING = {
    'NATURAL_DISASTER': NATURAL_DISASTER_WORKFLOW_ARN,
    'INFRASTRUCTURE_FAILURE': INFRASTRUCTURE_FAILURE_WORKFLOW_ARN,
    'SECURITY_INCIDENT': SECURITY_INCIDENT_WORKFLOW_ARN
}

def classify_emergency(event_data):
    """
    Classify the emergency type based on event data
    """
    # Check if emergency_type is already provided
    if 'emergency_type' in event_data:
        return event_data['emergency_type']
    
    # Simple classification logic based on keywords
    event_str = json.dumps(event_data).lower()
    
    if any(keyword in event_str for keyword in ['flood', 'earthquake', 'hurricane', 'tornado', 'wildfire', 'tsunami']):
        return 'NATURAL_DISASTER'
    elif any(keyword in event_str for keyword in ['outage', 'failure', 'downtime', 'unavailable', 'crash']):
        return 'INFRASTRUCTURE_FAILURE'
    elif any(keyword in event_str for keyword in ['breach', 'attack', 'hack', 'malware', 'ransomware', 'phishing']):
        return 'SECURITY_INCIDENT'
    else:
        return 'GENERAL_EMERGENCY'

def calculate_severity(event_data):
    """
    Calculate the severity of the emergency based on event data
    """
    # Check if severity is already provided
    if 'severity' in event_data:
        return event_data['severity']
    
    # Default severity calculation logic
    impact = int(event_data.get('impact_score', 3))
    urgency = int(event_data.get('urgency_score', 3))
    
    severity_score = impact * urgency
    
    if severity_score >= 12:
        return 'CRITICAL'
    elif severity_score >= 8:
        return 'HIGH'
    elif severity_score >= 4:
        return 'MEDIUM'
    else:
        return 'LOW'

def lambda_handler(event, context):
    """
    Main handler function for the MCP server
    """
    print(f"Received event: {json.dumps(event)}")
    
    # Handle API Gateway requests
    if 'httpMethod' in event:
        return handle_api_request(event, context)
    
    # Handle direct invocations and EventBridge events
    try:
        # Generate unique emergency ID
        emergency_id = str(uuid.uuid4())
        
        # Extract event data
        event_data = event.get('detail', event)
        
        # Identify emergency type and severity
        emergency_type = classify_emergency(event_data)
        severity = calculate_severity(event_data)
        
        # Get location information
        location = event_data.get('location', 'UNKNOWN')
        
        # Record emergency in DynamoDB
        timestamp = datetime.now().isoformat()
        emergency_record = {
            'emergency_id': emergency_id,
            'emergency_type': emergency_type,
            'severity': severity,
            'location': location,
            'timestamp': timestamp,
            'status': 'INITIATED',
            'affected_resources': event_data.get('affected_resources', []),
            'event_data': event_data
        }
        
        emergency_table.put_item(Item=emergency_record)
        
        # Start appropriate workflow based on emergency type
        workflow_arn = WORKFLOW_MAPPING.get(emergency_type)
        
        if not workflow_arn:
            raise Exception(f"No workflow defined for emergency type: {emergency_type}")
        
        # Prepare input for Step Function
        step_function_input = {
            'emergency_id': emergency_id,
            'emergency_type': emergency_type,
            'severity': severity,
            'location': location,
            'timestamp': timestamp,
            'affected_resources': event_data.get('affected_resources', [])
        }
        
        # Trigger Step Function workflow
        response = stepfunctions.start_execution(
            stateMachineArn=workflow_arn,
            name=f"emergency-{emergency_id}",
            input=json.dumps(step_function_input)
        )
        
        # Publish event to EventBridge
        events.put_events(
            Entries=[
                {
                    'Source': 'disaster-recovery-agent.mcp',
                    'DetailType': 'Emergency Initiated',
                    'Detail': json.dumps({
                        'emergency_id': emergency_id,
                        'emergency_type': emergency_type,
                        'severity': severity,
                        'status': 'INITIATED',
                        'workflow_execution_arn': response['executionArn']
                    }),
                    'EventBusName': EVENT_BUS_NAME
                }
            ]
        )
        
        # Return response
        return {
            'statusCode': 200,
            'body': json.dumps({
                'emergency_id': emergency_id,
                'workflow_execution_id': response['executionArn'],
                'status': 'INITIATED',
                'emergency_type': emergency_type,
                'severity': severity
            })
        }
    
    except Exception as e:
        print(f"Error processing emergency: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e)
            })
        }

def handle_api_request(event, context):
    """
    Handle API Gateway requests
    """
    http_method = event['httpMethod']
    path = event['path']
    
    # Extract path parameters
    path_parameters = event.get('pathParameters', {}) or {}
    
    # Handle GET /emergencies
    if http_method == 'GET' and path.endswith('/emergencies'):
        return get_emergencies(event)
    
    # Handle GET /emergencies/{emergencyId}
    elif http_method == 'GET' and '/emergencies/' in path and path_parameters.get('emergencyId'):
        return get_emergency(path_parameters['emergencyId'])
    
    # Handle POST /emergencies
    elif http_method == 'POST' and path.endswith('/emergencies'):
        return create_emergency(json.loads(event['body']))
    
    # Handle PUT /emergencies/{emergencyId}
    elif http_method == 'PUT' and '/emergencies/' in path and path_parameters.get('emergencyId'):
        return update_emergency(path_parameters['emergencyId'], json.loads(event['body']))
    
    # Handle POST /public-report
    elif http_method == 'POST' and path.endswith('/public-report'):
        return handle_public_report(json.loads(event['body']))
    
    # Handle unsupported routes
    else:
        return {
            'statusCode': 404,
            'body': json.dumps({
                'error': 'Not Found'
            })
        }

def get_emergencies(event):
    """
    Get all emergencies or filter by query parameters
    """
    query_parameters = event.get('queryStringParameters', {}) or {}
    
    # Check if we need to filter by status
    if 'status' in query_parameters:
        response = emergency_table.query(
            IndexName='StatusIndex',
            KeyConditionExpression='#status = :status',
            ExpressionAttributeNames={
                '#status': 'status'
            },
            ExpressionAttributeValues={
                ':status': query_parameters['status']
            }
        )
    # Check if we need to filter by type and severity
    elif 'type' in query_parameters and 'severity' in query_parameters:
        response = emergency_table.query(
            IndexName='TypeSeverityIndex',
            KeyConditionExpression='emergency_type = :type AND severity = :severity',
            ExpressionAttributeValues={
                ':type': query_parameters['type'],
                ':severity': query_parameters['severity']
            }
        )
    # Otherwise, scan all emergencies
    else:
        response = emergency_table.scan()
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'emergencies': response.get('Items', [])
        })
    }

def get_emergency(emergency_id):
    """
    Get a specific emergency by ID
    """
    response = emergency_table.get_item(
        Key={
            'emergency_id': emergency_id
        }
    )
    
    if 'Item' not in response:
        return {
            'statusCode': 404,
            'body': json.dumps({
                'error': f"Emergency with ID {emergency_id} not found"
            })
        }
    
    return {
        'statusCode': 200,
        'body': json.dumps(response['Item'])
    }

def create_emergency(body):
    """
    Create a new emergency
    """
    # This is the same as the main handler but for API requests
    try:
        # Generate unique emergency ID
        emergency_id = str(uuid.uuid4())
        
        # Identify emergency type and severity
        emergency_type = classify_emergency(body)
        severity = calculate_severity(body)
        
        # Get location information
        location = body.get('location', 'UNKNOWN')
        
        # Record emergency in DynamoDB
        timestamp = datetime.now().isoformat()
        emergency_record = {
            'emergency_id': emergency_id,
            'emergency_type': emergency_type,
            'severity': severity,
            'location': location,
            'timestamp': timestamp,
            'status': 'INITIATED',
            'affected_resources': body.get('affected_resources', []),
            'event_data': body
        }
        
        emergency_table.put_item(Item=emergency_record)
        
        # Start appropriate workflow based on emergency type
        workflow_arn = WORKFLOW_MAPPING.get(emergency_type)
        
        if not workflow_arn:
            raise Exception(f"No workflow defined for emergency type: {emergency_type}")
        
        # Prepare input for Step Function
        step_function_input = {
            'emergency_id': emergency_id,
            'emergency_type': emergency_type,
            'severity': severity,
            'location': location,
            'timestamp': timestamp,
            'affected_resources': body.get('affected_resources', [])
        }
        
        # Trigger Step Function workflow
        response = stepfunctions.start_execution(
            stateMachineArn=workflow_arn,
            name=f"emergency-{emergency_id}",
            input=json.dumps(step_function_input)
        )
        
        # Return response
        return {
            'statusCode': 201,
            'body': json.dumps({
                'emergency_id': emergency_id,
                'workflow_execution_id': response['executionArn'],
                'status': 'INITIATED',
                'emergency_type': emergency_type,
                'severity': severity
            })
        }
    
    except Exception as e:
        print(f"Error creating emergency: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e)
            })
        }

def update_emergency(emergency_id, body):
    """
    Update an existing emergency
    """
    try:
        # Get the current emergency
        response = emergency_table.get_item(
            Key={
                'emergency_id': emergency_id
            }
        )
        
        if 'Item' not in response:
            return {
                'statusCode': 404,
                'body': json.dumps({
                    'error': f"Emergency with ID {emergency_id} not found"
                })
            }
        
        # Update the emergency
        update_expression = "set "
        expression_attribute_values = {}
        expression_attribute_names = {}
        
        # Build the update expression
        for key, value in body.items():
            if key not in ['emergency_id', 'timestamp']:  # Don't allow updating these fields
                update_expression += f"#{key} = :{key}, "
                expression_attribute_values[f":{key}"] = value
                expression_attribute_names[f"#{key}"] = key
        
        # Remove trailing comma and space
        update_expression = update_expression[:-2]
        
        # Update the item
        emergency_table.update_item(
            Key={
                'emergency_id': emergency_id
            },
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_attribute_values,
            ExpressionAttributeNames=expression_attribute_names,
            ReturnValues="ALL_NEW"
        )
        
        # Get the updated item
        response = emergency_table.get_item(
            Key={
                'emergency_id': emergency_id
            }
        )
        
        return {
            'statusCode': 200,
            'body': json.dumps(response['Item'])
        }
    
    except Exception as e:
        print(f"Error updating emergency: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e)
            })
        }

def handle_public_report(body):
    """
    Handle public emergency reports
    """
    # Add validation for public reports
    if 'reporter_contact' not in body:
        return {
            'statusCode': 400,
            'body': json.dumps({
                'error': 'Reporter contact information is required'
            })
        }
    
    if 'description' not in body:
        return {
            'statusCode': 400,
            'body': json.dumps({
                'error': 'Emergency description is required'
            })
        }
    
    # Create the emergency
    return create_emergency(body)
