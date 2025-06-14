import json
import boto3
import os
from datetime import datetime

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
sns = boto3.client('sns')
sqs = boto3.client('sqs')

# Get environment variables
TEAM_TABLE = os.environ.get('TEAM_TABLE')
EMERGENCY_ALERT_TOPIC_ARN = os.environ.get('EMERGENCY_ALERT_TOPIC_ARN')
RESPONSE_TEAM_TOPIC_ARN = os.environ.get('RESPONSE_TEAM_TOPIC_ARN')
CRITICAL_ALERT_TOPIC_ARN = os.environ.get('CRITICAL_ALERT_TOPIC_ARN')
TASK_QUEUE_URL = os.environ.get('TASK_QUEUE_URL')
ORDERED_TASK_QUEUE_URL = os.environ.get('ORDERED_TASK_QUEUE_URL')

# Initialize DynamoDB table
team_table = dynamodb.Table(TEAM_TABLE)

def get_teams_by_specialty(specialties):
    """
    Get teams with the specified specialties
    """
    teams = []
    
    for specialty in specialties:
        # Query the team table for teams with this specialty
        response = team_table.query(
            IndexName='SpecialtyIndex',
            KeyConditionExpression='specialty = :specialty AND availability_status = :status',
            ExpressionAttributeValues={
                ':specialty': specialty,
                ':status': 'AVAILABLE'
            }
        )
        
        # Add the teams to our list
        teams.extend(response.get('Items', []))
    
    return teams

def send_emergency_alert(emergency_data, teams):
    """
    Send emergency alert to the specified teams
    """
    # Prepare the message
    emergency_id = emergency_data['emergency_id']
    emergency_type = emergency_data['emergency_type']
    severity = emergency_data['severity']
    location = emergency_data['location']
    
    message = {
        'emergency_id': emergency_id,
        'emergency_type': emergency_type,
        'severity': severity,
        'location': location,
        'timestamp': datetime.now().isoformat(),
        'message': f"EMERGENCY ALERT: {emergency_type} at {location}. Severity: {severity}."
    }
    
    # Add assessment if available
    if 'assessment' in emergency_data:
        message['assessment'] = emergency_data['assessment']
    
    # Send to the appropriate SNS topic based on severity
    if severity == 'CRITICAL' and CRITICAL_ALERT_TOPIC_ARN:
        sns.publish(
            TopicArn=CRITICAL_ALERT_TOPIC_ARN,
            Message=json.dumps(message),
            Subject=f"CRITICAL EMERGENCY ALERT: {emergency_type}"
        )
    elif EMERGENCY_ALERT_TOPIC_ARN:
        sns.publish(
            TopicArn=EMERGENCY_ALERT_TOPIC_ARN,
            Message=json.dumps(message),
            Subject=f"EMERGENCY ALERT: {emergency_type}"
        )
    
    # Send targeted notifications to teams
    if RESPONSE_TEAM_TOPIC_ARN:
        for team in teams:
            team_message = message.copy()
            team_message['team_id'] = team['team_id']
            team_message['team_name'] = team.get('team_name', 'Response Team')
            team_message['message'] = f"TEAM ALERT: {team.get('team_name', 'Response Team')} is requested for {emergency_type} at {location}. Severity: {severity}."
            
            sns.publish(
                TopicArn=RESPONSE_TEAM_TOPIC_ARN,
                Message=json.dumps(team_message),
                Subject=f"TEAM ALERT: {emergency_type}",
                MessageAttributes={
                    'team_id': {
                        'DataType': 'String',
                        'StringValue': team['team_id']
                    }
                }
            )
    
    # Create tasks in SQS if available
    if TASK_QUEUE_URL:
        for team in teams:
            task_message = {
                'emergency_id': emergency_id,
                'team_id': team['team_id'],
                'task_type': 'RESPOND',
                'priority': get_priority_from_severity(severity),
                'description': f"Respond to {emergency_type} at {location}",
                'created_at': datetime.now().isoformat()
            }
            
            sqs.send_message(
                QueueUrl=TASK_QUEUE_URL,
                MessageBody=json.dumps(task_message)
            )
    
    return len(teams)

def get_priority_from_severity(severity):
    """
    Convert severity to priority number
    """
    priority_map = {
        'CRITICAL': 1,
        'HIGH': 2,
        'MEDIUM': 3,
        'LOW': 4
    }
    
    return priority_map.get(severity, 3)

def lambda_handler(event, context):
    """
    Main handler function for notifications
    """
    print(f"Received event: {json.dumps(event)}")
    
    try:
        # Get emergency ID from the event
        emergency_id = event['emergency_id']
        emergency_type = event['emergency_type']
        severity = event['severity']
        
        # Determine which teams to notify based on emergency type and severity
        specialties_to_notify = []
        
        if emergency_type == 'NATURAL_DISASTER':
            if severity in ['CRITICAL', 'HIGH']:
                specialties_to_notify = ['emergency-response', 'medical', 'evacuation', 'shelter']
            else:
                specialties_to_notify = ['emergency-response', 'shelter']
        
        elif emergency_type == 'INFRASTRUCTURE_FAILURE':
            if severity in ['CRITICAL', 'HIGH']:
                specialties_to_notify = ['it-emergency', 'network', 'database', 'application']
            else:
                specialties_to_notify = ['it-emergency', 'application']
        
        elif emergency_type == 'SECURITY_INCIDENT':
            if severity in ['CRITICAL', 'HIGH']:
                specialties_to_notify = ['security', 'forensics', 'network', 'communications']
            else:
                specialties_to_notify = ['security', 'network']
        
        else:  # Default for unknown emergency types
            specialties_to_notify = ['emergency-response']
        
        # Get teams with the required specialties
        teams = get_teams_by_specialty(specialties_to_notify)
        
        # Send emergency alerts
        notifications_sent = send_emergency_alert(event, teams)
        
        # Return the notification results
        return {
            'emergency_id': emergency_id,
            'status': 'NOTIFICATIONS_SENT',
            'notifications_sent': notifications_sent,
            'teams_notified': [team['team_id'] for team in teams],
            'notification_timestamp': datetime.now().isoformat()
        }
    
    except Exception as e:
        print(f"Error sending notifications: {str(e)}")
        return {
            'error': str(e),
            'status': 'ERROR'
        }
