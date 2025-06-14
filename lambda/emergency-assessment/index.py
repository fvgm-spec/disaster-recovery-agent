import json
import boto3
import os
import uuid
from datetime import datetime

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')
bedrock_runtime = boto3.client('bedrock-runtime')

# Get environment variables
EMERGENCY_TABLE = os.environ.get('EMERGENCY_TABLE')
SITUATION_ANALYSIS_FUNCTION_ARN = os.environ.get('SITUATION_ANALYSIS_FUNCTION_ARN')
RESOURCE_RECOMMENDATION_FUNCTION_ARN = os.environ.get('RESOURCE_RECOMMENDATION_FUNCTION_ARN')

# Initialize DynamoDB table
emergency_table = dynamodb.Table(EMERGENCY_TABLE)

def analyze_emergency_with_ai(emergency_data):
    """
    Use Amazon Bedrock to analyze the emergency situation
    """
    try:
        # If we have a dedicated function for situation analysis, use it
        if SITUATION_ANALYSIS_FUNCTION_ARN:
            response = lambda_client.invoke(
                FunctionName=SITUATION_ANALYSIS_FUNCTION_ARN,
                InvocationType='RequestResponse',
                Payload=json.dumps(emergency_data)
            )
            return json.loads(response['Payload'].read())
        
        # Otherwise, use Bedrock directly
        prompt = f"""
        Analyze the following emergency situation and provide recommendations:
        Type: {emergency_data['emergency_type']}
        Location: {emergency_data['location']}
        Affected area: {emergency_data.get('affected_area', 'Unknown')}
        Current status: {emergency_data['status']}
        Severity: {emergency_data['severity']}
        Affected resources: {json.dumps(emergency_data.get('affected_resources', []))}
        
        Provide:
        1. Immediate actions to take
        2. Resource allocation recommendations
        3. Potential risks and mitigation strategies
        4. Communication plan
        """
        
        response = bedrock_runtime.invoke_model(
            modelId='anthropic.claude-v2',
            contentType='application/json',
            accept='application/json',
            body=json.dumps({
                'prompt': prompt,
                'max_tokens_to_sample': 1000
            })
        )
        
        response_body = json.loads(response['body'].read())
        return {
            'analysis': response_body['completion'],
            'status': 'SUCCESS'
        }
    
    except Exception as e:
        print(f"Error analyzing emergency with AI: {str(e)}")
        return {
            'analysis': f"Error analyzing emergency: {str(e)}",
            'status': 'ERROR'
        }

def get_resource_recommendations(emergency_data):
    """
    Get resource recommendations for the emergency
    """
    try:
        # If we have a dedicated function for resource recommendations, use it
        if RESOURCE_RECOMMENDATION_FUNCTION_ARN:
            response = lambda_client.invoke(
                FunctionName=RESOURCE_RECOMMENDATION_FUNCTION_ARN,
                InvocationType='RequestResponse',
                Payload=json.dumps(emergency_data)
            )
            return json.loads(response['Payload'].read())
        
        # Default resource recommendations based on emergency type and severity
        emergency_type = emergency_data['emergency_type']
        severity = emergency_data['severity']
        
        recommendations = {
            'NATURAL_DISASTER': {
                'CRITICAL': ['emergency-response-team', 'medical-team', 'evacuation-team', 'shelter-team'],
                'HIGH': ['emergency-response-team', 'medical-team', 'shelter-team'],
                'MEDIUM': ['emergency-response-team', 'shelter-team'],
                'LOW': ['emergency-response-team']
            },
            'INFRASTRUCTURE_FAILURE': {
                'CRITICAL': ['it-emergency-team', 'network-team', 'database-team', 'application-team'],
                'HIGH': ['it-emergency-team', 'network-team', 'database-team'],
                'MEDIUM': ['it-emergency-team', 'application-team'],
                'LOW': ['it-emergency-team']
            },
            'SECURITY_INCIDENT': {
                'CRITICAL': ['security-team', 'forensics-team', 'network-team', 'communications-team'],
                'HIGH': ['security-team', 'forensics-team', 'network-team'],
                'MEDIUM': ['security-team', 'network-team'],
                'LOW': ['security-team']
            }
        }
        
        default_recommendations = ['emergency-response-team']
        
        return {
            'recommended_resources': recommendations.get(emergency_type, {}).get(severity, default_recommendations),
            'status': 'SUCCESS'
        }
    
    except Exception as e:
        print(f"Error getting resource recommendations: {str(e)}")
        return {
            'recommended_resources': ['emergency-response-team'],
            'status': 'ERROR',
            'error': str(e)
        }

def lambda_handler(event, context):
    """
    Main handler function for emergency assessment
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
        
        # Update emergency status to ASSESSING
        emergency_table.update_item(
            Key={
                'emergency_id': emergency_id
            },
            UpdateExpression="set #status = :status",
            ExpressionAttributeNames={
                '#status': 'status'
            },
            ExpressionAttributeValues={
                ':status': 'ASSESSING'
            }
        )
        
        # Analyze the emergency with AI
        analysis_result = analyze_emergency_with_ai(emergency_data)
        
        # Get resource recommendations
        resource_recommendations = get_resource_recommendations(emergency_data)
        
        # Update the emergency with assessment results
        emergency_table.update_item(
            Key={
                'emergency_id': emergency_id
            },
            UpdateExpression="set #status = :status, assessment = :assessment, recommended_resources = :recommended_resources, assessment_timestamp = :timestamp",
            ExpressionAttributeNames={
                '#status': 'status'
            },
            ExpressionAttributeValues={
                ':status': 'ASSESSED',
                ':assessment': analysis_result.get('analysis', 'No analysis available'),
                ':recommended_resources': resource_recommendations.get('recommended_resources', []),
                ':timestamp': datetime.now().isoformat()
            }
        )
        
        # Return the assessment results
        return {
            'emergency_id': emergency_id,
            'status': 'ASSESSED',
            'assessment': analysis_result.get('analysis', 'No analysis available'),
            'recommended_resources': resource_recommendations.get('recommended_resources', []),
            'assessment_timestamp': datetime.now().isoformat()
        }
    
    except Exception as e:
        print(f"Error assessing emergency: {str(e)}")
        
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
                        ':status': 'ASSESSMENT_ERROR',
                        ':error_message': str(e)
                    }
                )
            except Exception as update_error:
                print(f"Error updating emergency status: {str(update_error)}")
        
        return {
            'error': str(e),
            'status': 'ERROR'
        }
