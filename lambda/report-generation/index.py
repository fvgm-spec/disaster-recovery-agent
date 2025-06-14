import json
import boto3
import os
from datetime import datetime

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
bedrock_runtime = boto3.client('bedrock-runtime')

# Get environment variables
EMERGENCY_TABLE = os.environ.get('EMERGENCY_TABLE')
RESOURCE_TABLE = os.environ.get('RESOURCE_TABLE')

# Initialize DynamoDB tables
emergency_table = dynamodb.Table(EMERGENCY_TABLE)
resource_table = dynamodb.Table(RESOURCE_TABLE)

def generate_situation_report(emergency_data, allocated_resources):
    """
    Generate a situation report using Amazon Bedrock
    """
    try:
        # Extract relevant information
        emergency_id = emergency_data['emergency_id']
        emergency_type = emergency_data['emergency_type']
        severity = emergency_data['severity']
        location = emergency_data['location']
        timestamp = emergency_data['timestamp']
        status = emergency_data['status']
        assessment = emergency_data.get('assessment', 'No assessment available')
        
        # Create a prompt for Bedrock
        prompt = f"""
        Generate a detailed situation report for the following emergency:
        
        Emergency ID: {emergency_id}
        Type: {emergency_type}
        Severity: {severity}
        Location: {location}
        Time Reported: {timestamp}
        Current Status: {status}
        
        Assessment:
        {assessment}
        
        Allocated Resources:
        {json.dumps(allocated_resources, indent=2)}
        
        Please format the report with the following sections:
        1. Executive Summary
        2. Situation Overview
        3. Current Status
        4. Resource Allocation
        5. Next Steps and Recommendations
        """
        
        # Call Bedrock to generate the report
        response = bedrock_runtime.invoke_model(
            modelId='anthropic.claude-v2',
            contentType='application/json',
            accept='application/json',
            body=json.dumps({
                'prompt': prompt,
                'max_tokens_to_sample': 2000
            })
        )
        
        response_body = json.loads(response['body'].read())
        return response_body['completion']
    
    except Exception as e:
        print(f"Error generating situation report with AI: {str(e)}")
        
        # Generate a basic report if AI fails
        return f"""
        # Situation Report
        
        ## Executive Summary
        {emergency_type} at {location} with {severity} severity.
        
        ## Situation Overview
        Emergency reported at {timestamp}.
        
        ## Current Status
        Current status is {status}.
        
        ## Resource Allocation
        {len(allocated_resources)} resources have been allocated.
        
        ## Next Steps and Recommendations
        Continue monitoring the situation.
        
        Error generating detailed report: {str(e)}
        """

def lambda_handler(event, context):
    """
    Main handler function for report generation
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
        
        # Get allocated resources
        allocated_resources = emergency_data.get('allocated_resources', [])
        
        # Generate the situation report
        report = generate_situation_report(emergency_data, allocated_resources)
        
        # Update the emergency with the report
        emergency_table.update_item(
            Key={
                'emergency_id': emergency_id
            },
            UpdateExpression="set situation_report = :report, report_timestamp = :timestamp, #status = :status",
            ExpressionAttributeNames={
                '#status': 'status'
            },
            ExpressionAttributeValues={
                ':report': report,
                ':timestamp': datetime.now().isoformat(),
                ':status': 'REPORT_GENERATED'
            }
        )
        
        # Return the report
        return {
            'emergency_id': emergency_id,
            'status': 'REPORT_GENERATED',
            'report': report,
            'report_timestamp': datetime.now().isoformat()
        }
    
    except Exception as e:
        print(f"Error generating report: {str(e)}")
        
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
                        ':status': 'REPORT_ERROR',
                        ':error_message': str(e)
                    }
                )
            except Exception as update_error:
                print(f"Error updating emergency status: {str(update_error)}")
        
        return {
            'error': str(e),
            'status': 'ERROR'
        }
