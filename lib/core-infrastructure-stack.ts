import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';

export class CoreInfrastructureStack extends cdk.Stack {
  public readonly eventBus: events.EventBus;
  public readonly emergencyTable: dynamodb.Table;
  public readonly resourceTable: dynamodb.Table;
  public readonly teamTable: dynamodb.Table;
  public readonly mcpServiceRole: iam.Role;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create custom EventBridge event bus for emergency events
    this.eventBus = new events.EventBus(this, 'EmergencyEventBus', {
      eventBusName: 'emergency-response-bus'
    });

    // Add archive for all events with 90-day retention
    new events.CfnEventBusPolicy(this, 'EventBusPolicy', {
      statementId: 'AllowAllAccountEventsPolicy',
      eventBusName: this.eventBus.eventBusName,
      statement: {
        Effect: 'Allow',
        Principal: { AWS: `arn:aws:iam::${this.account}:root` },
        Action: 'events:PutEvents',
        Resource: this.eventBus.eventBusArn
      }
    });

    new events.Archive(this, 'EmergencyEventArchive', {
      sourceEventBus: this.eventBus,
      archiveName: 'emergency-events-archive',
      retention: cdk.Duration.days(90),
    });

    // Create DynamoDB tables
    this.emergencyTable = new dynamodb.Table(this, 'EmergencyEventsTable', {
      partitionKey: { name: 'emergency_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Add GSIs for efficient querying
    this.emergencyTable.addGlobalSecondaryIndex({
      indexName: 'StatusIndex',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.emergencyTable.addGlobalSecondaryIndex({
      indexName: 'TypeSeverityIndex',
      partitionKey: { name: 'emergency_type', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'severity', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Resource inventory table
    this.resourceTable = new dynamodb.Table(this, 'ResourceInventoryTable', {
      partitionKey: { name: 'resource_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.resourceTable.addGlobalSecondaryIndex({
      indexName: 'ResourceTypeIndex',
      partitionKey: { name: 'resource_type', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'availability_status', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Emergency response team table
    this.teamTable = new dynamodb.Table(this, 'EmergencyTeamTable', {
      partitionKey: { name: 'team_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.teamTable.addGlobalSecondaryIndex({
      indexName: 'SpecialtyIndex',
      partitionKey: { name: 'specialty', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'availability_status', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Create IAM role for MCP service
    this.mcpServiceRole = new iam.Role(this, 'MCPServiceRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Role for the MCP Lambda service',
    });

    // Add permissions to the MCP service role
    this.mcpServiceRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );

    this.mcpServiceRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:Query',
        'dynamodb:Scan'
      ],
      resources: [
        this.emergencyTable.tableArn,
        this.resourceTable.tableArn,
        this.teamTable.tableArn,
        `${this.emergencyTable.tableArn}/index/*`,
        `${this.resourceTable.tableArn}/index/*`,
        `${this.teamTable.tableArn}/index/*`
      ]
    }));

    this.mcpServiceRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'states:StartExecution',
        'states:DescribeExecution'
      ],
      resources: ['*'] // Will be scoped down when Step Functions are created
    }));

    this.mcpServiceRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'events:PutEvents'
      ],
      resources: [this.eventBus.eventBusArn]
    }));

    // Output important resource ARNs
    new cdk.CfnOutput(this, 'EventBusArn', {
      value: this.eventBus.eventBusArn,
      description: 'ARN of the Emergency Event Bus',
      exportName: 'EmergencyEventBusArn',
    });

    new cdk.CfnOutput(this, 'EmergencyTableName', {
      value: this.emergencyTable.tableName,
      description: 'Name of the Emergency Events Table',
      exportName: 'EmergencyEventsTableName',
    });
  }
}
