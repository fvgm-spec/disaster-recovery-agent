import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { LambdaFunctionsStack } from './lambda-functions-stack';

export class NotificationStack extends cdk.Stack {
  public readonly emergencyAlertTopic: sns.Topic;
  public readonly responseTeamTopic: sns.Topic;
  public readonly taskQueue: sqs.Queue;

  constructor(scope: Construct, id: string, lambdaStack: LambdaFunctionsStack, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create SNS topics for different notification types
    this.emergencyAlertTopic = new sns.Topic(this, 'EmergencyAlertTopic', {
      displayName: 'Emergency Alert Notifications',
      topicName: 'emergency-alerts'
    });

    this.responseTeamTopic = new sns.Topic(this, 'ResponseTeamTopic', {
      displayName: 'Response Team Notifications',
      topicName: 'response-team-alerts'
    });

    // Create a high-priority topic for critical alerts
    const criticalAlertTopic = new sns.Topic(this, 'CriticalAlertTopic', {
      displayName: 'Critical Emergency Alerts',
      topicName: 'critical-emergency-alerts'
    });

    // Create SQS queue for task distribution
    this.taskQueue = new sqs.Queue(this, 'TaskDistributionQueue', {
      visibilityTimeout: cdk.Duration.seconds(300),
      retentionPeriod: cdk.Duration.days(14),
      deadLetterQueue: {
        queue: new sqs.Queue(this, 'TaskDLQ', {
          retentionPeriod: cdk.Duration.days(14)
        }),
        maxReceiveCount: 3
      }
    });

    // Create a FIFO queue for ordered task processing
    const orderedTaskQueue = new sqs.Queue(this, 'OrderedTaskQueue', {
      fifo: true,
      contentBasedDeduplication: true,
      visibilityTimeout: cdk.Duration.seconds(300)
    });

    // Subscribe the task queue to the response team topic
    this.responseTeamTopic.addSubscription(
      new subscriptions.SqsSubscription(this.taskQueue)
    );

    // Grant permissions to the notification function
    this.emergencyAlertTopic.grantPublish(lambdaStack.notificationFunction);
    this.responseTeamTopic.grantPublish(lambdaStack.notificationFunction);
    criticalAlertTopic.grantPublish(lambdaStack.notificationFunction);
    
    // Update environment variables for the notification function
    lambdaStack.notificationFunction.addEnvironment('EMERGENCY_ALERT_TOPIC_ARN', this.emergencyAlertTopic.topicArn);
    lambdaStack.notificationFunction.addEnvironment('RESPONSE_TEAM_TOPIC_ARN', this.responseTeamTopic.topicArn);
    lambdaStack.notificationFunction.addEnvironment('CRITICAL_ALERT_TOPIC_ARN', criticalAlertTopic.topicArn);
    lambdaStack.notificationFunction.addEnvironment('TASK_QUEUE_URL', this.taskQueue.queueUrl);
    lambdaStack.notificationFunction.addEnvironment('ORDERED_TASK_QUEUE_URL', orderedTaskQueue.queueUrl);

    // Output the topic ARNs
    new cdk.CfnOutput(this, 'EmergencyAlertTopicArn', {
      value: this.emergencyAlertTopic.topicArn,
      description: 'ARN of the Emergency Alert SNS Topic',
      exportName: 'EmergencyAlertTopicArn',
    });

    new cdk.CfnOutput(this, 'ResponseTeamTopicArn', {
      value: this.responseTeamTopic.topicArn,
      description: 'ARN of the Response Team SNS Topic',
      exportName: 'ResponseTeamTopicArn',
    });
  }
}
