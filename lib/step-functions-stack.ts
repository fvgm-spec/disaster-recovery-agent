import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as fs from 'fs';
import * as path from 'path';
import { LambdaFunctionsStack } from './lambda-functions-stack';

export class StepFunctionsStack extends cdk.Stack {
  public readonly naturalDisasterWorkflow: sfn.StateMachine;
  public readonly infrastructureFailureWorkflow: sfn.StateMachine;
  public readonly securityIncidentWorkflow: sfn.StateMachine;

  constructor(scope: Construct, id: string, lambdaStack: LambdaFunctionsStack, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create Natural Disaster Workflow
    const assessEmergency = new tasks.LambdaInvoke(this, 'AssessEmergency', {
      lambdaFunction: lambdaStack.assessmentFunction,
      outputPath: '$.Payload',
    });

    const notifyTeams = new tasks.LambdaInvoke(this, 'NotifyEmergencyTeams', {
      lambdaFunction: lambdaStack.notificationFunction,
      outputPath: '$.Payload',
    });

    const allocateResources = new tasks.LambdaInvoke(this, 'AllocateResources', {
      lambdaFunction: lambdaStack.resourceAllocationFunction,
      outputPath: '$.Payload',
    });

    const generateReport = new tasks.LambdaInvoke(this, 'GenerateSituationReport', {
      lambdaFunction: lambdaStack.reportGenerationFunction,
      outputPath: '$.Payload',
    });

    // Create parallel execution for concurrent tasks
    const parallelExecution = new sfn.Parallel(this, 'ParallelResponse')
      .branch(allocateResources)
      .branch(new sfn.Pass(this, 'AssessDamage')) // Placeholder for damage assessment
      .branch(new sfn.Pass(this, 'CoordinateEvacuation')); // Placeholder for evacuation

    // Define the workflow
    const naturalDisasterDefinition = assessEmergency
      .next(notifyTeams)
      .next(parallelExecution)
      .next(generateReport);

    // Create the state machine
    this.naturalDisasterWorkflow = new sfn.StateMachine(this, 'NaturalDisasterWorkflow', {
      definition: naturalDisasterDefinition,
      stateMachineName: 'NaturalDisasterResponseWorkflow',
      timeout: cdk.Duration.minutes(30),
    });

    // Create Infrastructure Failure Workflow (simplified example)
    const infrastructureFailureDefinition = assessEmergency
      .next(notifyTeams)
      .next(new sfn.Parallel(this, 'InfraFailureParallel')
        .branch(allocateResources)
        .branch(new sfn.Pass(this, 'IsolateSystem'))
        .branch(new sfn.Pass(this, 'ActivateFailover')))
      .next(generateReport);

    this.infrastructureFailureWorkflow = new sfn.StateMachine(this, 'InfrastructureFailureWorkflow', {
      definition: infrastructureFailureDefinition,
      stateMachineName: 'InfrastructureFailureResponseWorkflow',
      timeout: cdk.Duration.minutes(30),
    });

    // Create Security Incident Workflow (simplified example)
    const securityIncidentDefinition = assessEmergency
      .next(notifyTeams)
      .next(new sfn.Parallel(this, 'SecurityIncidentParallel')
        .branch(new sfn.Pass(this, 'ContainThreat'))
        .branch(new sfn.Pass(this, 'ProtectSystems'))
        .branch(allocateResources))
      .next(generateReport);

    this.securityIncidentWorkflow = new sfn.StateMachine(this, 'SecurityIncidentWorkflow', {
      definition: securityIncidentDefinition,
      stateMachineName: 'SecurityIncidentResponseWorkflow',
      timeout: cdk.Duration.minutes(30),
    });

    // Update MCP Lambda with Step Function ARNs
    lambdaStack.mcpServerFunction.addEnvironment('NATURAL_DISASTER_WORKFLOW_ARN', this.naturalDisasterWorkflow.stateMachineArn);
    lambdaStack.mcpServerFunction.addEnvironment('INFRASTRUCTURE_FAILURE_WORKFLOW_ARN', this.infrastructureFailureWorkflow.stateMachineArn);
    lambdaStack.mcpServerFunction.addEnvironment('SECURITY_INCIDENT_WORKFLOW_ARN', this.securityIncidentWorkflow.stateMachineArn);
  }
}
