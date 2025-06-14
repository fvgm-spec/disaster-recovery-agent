import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { LambdaFunctionsStack } from './lambda-functions-stack';
import { StepFunctionsStack } from './step-functions-stack';

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, lambdaStack: LambdaFunctionsStack, stepFunctionsStack: StepFunctionsStack, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create an SNS topic for alarms
    const alarmTopic = new sns.Topic(this, 'EmergencySystemAlarmTopic', {
      displayName: 'Emergency System Alarms',
      topicName: 'emergency-system-alarms'
    });

    // Create a dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'DisasterRecoveryDashboard', {
      dashboardName: 'DisasterRecoveryAgent-Dashboard',
    });

    // Add Lambda metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'MCP Server Invocations and Errors',
        left: [
          lambdaStack.mcpServerFunction.metricInvocations(),
          lambdaStack.mcpServerFunction.metricErrors(),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration',
        left: [
          lambdaStack.mcpServerFunction.metricDuration(),
          lambdaStack.assessmentFunction.metricDuration(),
          lambdaStack.resourceAllocationFunction.metricDuration(),
        ],
        width: 12,
      })
    );

    // Add Step Functions metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Natural Disaster Workflow Executions',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/States',
            metricName: 'ExecutionsStarted',
            dimensionsMap: {
              StateMachineArn: stepFunctionsStack.naturalDisasterWorkflow.stateMachineArn,
            },
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/States',
            metricName: 'ExecutionsSucceeded',
            dimensionsMap: {
              StateMachineArn: stepFunctionsStack.naturalDisasterWorkflow.stateMachineArn,
            },
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/States',
            metricName: 'ExecutionsFailed',
            dimensionsMap: {
              StateMachineArn: stepFunctionsStack.naturalDisasterWorkflow.stateMachineArn,
            },
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Infrastructure Failure Workflow Executions',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/States',
            metricName: 'ExecutionsStarted',
            dimensionsMap: {
              StateMachineArn: stepFunctionsStack.infrastructureFailureWorkflow.stateMachineArn,
            },
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/States',
            metricName: 'ExecutionsSucceeded',
            dimensionsMap: {
              StateMachineArn: stepFunctionsStack.infrastructureFailureWorkflow.stateMachineArn,
            },
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/States',
            metricName: 'ExecutionsFailed',
            dimensionsMap: {
              StateMachineArn: stepFunctionsStack.infrastructureFailureWorkflow.stateMachineArn,
            },
          }),
        ],
        width: 12,
      })
    );

    // Add Security Incident metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Security Incident Workflow Executions',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/States',
            metricName: 'ExecutionsStarted',
            dimensionsMap: {
              StateMachineArn: stepFunctionsStack.securityIncidentWorkflow.stateMachineArn,
            },
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/States',
            metricName: 'ExecutionsSucceeded',
            dimensionsMap: {
              StateMachineArn: stepFunctionsStack.securityIncidentWorkflow.stateMachineArn,
            },
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/States',
            metricName: 'ExecutionsFailed',
            dimensionsMap: {
              StateMachineArn: stepFunctionsStack.securityIncidentWorkflow.stateMachineArn,
            },
          }),
        ],
        width: 12,
      })
    );

    // Create alarms
    const mcpErrorAlarm = new cloudwatch.Alarm(this, 'MCPErrorAlarm', {
      metric: lambdaStack.mcpServerFunction.metricErrors(),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Alarm if the MCP server has any errors',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const workflowFailureAlarm = new cloudwatch.Alarm(this, 'WorkflowFailureAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/States',
        metricName: 'ExecutionsFailed',
        dimensionsMap: {
          StateMachineArn: stepFunctionsStack.naturalDisasterWorkflow.stateMachineArn,
        },
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Alarm if any natural disaster workflow execution fails',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const highDurationAlarm = new cloudwatch.Alarm(this, 'HighDurationAlarm', {
      metric: lambdaStack.assessmentFunction.metricDuration(),
      threshold: 50000, // 50 seconds (in milliseconds)
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      alarmDescription: 'Alarm if the assessment function takes too long to execute',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Add alarm actions
    mcpErrorAlarm.addAlarmAction(new actions.SnsAction(alarmTopic));
    workflowFailureAlarm.addAlarmAction(new actions.SnsAction(alarmTopic));
    highDurationAlarm.addAlarmAction(new actions.SnsAction(alarmTopic));

    // Output the dashboard URL
    new cdk.CfnOutput(this, 'DashboardURL', {
      value: `https://\${AWS::Region}.console.aws.amazon.com/cloudwatch/home?region=\${AWS::Region}#dashboards:name=${dashboard.dashboardName}`,
      description: 'URL of the Emergency Response System Dashboard',
      exportName: 'EmergencyResponseDashboardURL',
    });

    // Output the alarm topic ARN
    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: alarmTopic.topicArn,
      description: 'ARN of the Alarm SNS Topic',
      exportName: 'EmergencySystemAlarmTopicArn',
    });
  }
}
