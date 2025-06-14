import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { CoreInfrastructureStack } from './core-infrastructure-stack';

export class LambdaFunctionsStack extends cdk.Stack {
  public readonly mcpServerFunction: lambda.Function;
  public readonly assessmentFunction: lambda.Function;
  public readonly resourceAllocationFunction: lambda.Function;
  public readonly notificationFunction: lambda.Function;
  public readonly reportGenerationFunction: lambda.Function;

  constructor(scope: Construct, id: string, coreStack: CoreInfrastructureStack, props?: cdk.StackProps) {
    super(scope, id, props);

    // MCP Server Lambda Function
    this.mcpServerFunction = new lambda.Function(this, 'MCPServerFunction', {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/mcp-server')),
      role: coreStack.mcpServiceRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        EMERGENCY_TABLE: coreStack.emergencyTable.tableName,
        RESOURCE_TABLE: coreStack.resourceTable.tableName,
        TEAM_TABLE: coreStack.teamTable.tableName,
        EVENT_BUS_NAME: coreStack.eventBus.eventBusName
      }
    });

    // Emergency Assessment Function
    this.assessmentFunction = new lambda.Function(this, 'EmergencyAssessmentFunction', {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/emergency-assessment')),
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      environment: {
        EMERGENCY_TABLE: coreStack.emergencyTable.tableName
      }
    });

    // Add Bedrock permissions to assessment function
    this.assessmentFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'bedrock:InvokeModel'
      ],
      resources: ['*'] // Scope down to specific models in production
    }));

    // Resource Allocation Function
    this.resourceAllocationFunction = new lambda.Function(this, 'ResourceAllocationFunction', {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/resource-allocation')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        RESOURCE_TABLE: coreStack.resourceTable.tableName,
        EMERGENCY_TABLE: coreStack.emergencyTable.tableName
      }
    });

    // Notification Function
    this.notificationFunction = new lambda.Function(this, 'NotificationFunction', {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/notification')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        TEAM_TABLE: coreStack.teamTable.tableName
      }
    });

    // Add SNS permissions to notification function
    this.notificationFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'sns:Publish'
      ],
      resources: ['*'] // Will be scoped down when SNS topics are created
    }));

    // Report Generation Function
    this.reportGenerationFunction = new lambda.Function(this, 'ReportGenerationFunction', {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/report-generation')),
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      environment: {
        EMERGENCY_TABLE: coreStack.emergencyTable.tableName,
        RESOURCE_TABLE: coreStack.resourceTable.tableName
      }
    });

    // Grant DynamoDB permissions to all functions
    coreStack.emergencyTable.grantReadWriteData(this.assessmentFunction);
    coreStack.emergencyTable.grantReadWriteData(this.resourceAllocationFunction);
    coreStack.emergencyTable.grantReadData(this.notificationFunction);
    coreStack.emergencyTable.grantReadData(this.reportGenerationFunction);
    
    coreStack.resourceTable.grantReadWriteData(this.resourceAllocationFunction);
    coreStack.resourceTable.grantReadData(this.reportGenerationFunction);
    
    coreStack.teamTable.grantReadData(this.notificationFunction);
  }
}
