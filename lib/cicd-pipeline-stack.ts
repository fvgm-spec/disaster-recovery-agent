import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as iam from 'aws-cdk-lib/aws-iam';

export class CiCdPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Pipeline artifact bucket
    const artifactBucket = new cdk.aws_s3.Bucket(this, 'ArtifactBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: cdk.aws_s3.BucketEncryption.S3_MANAGED,
    });

    // Pipeline
    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: 'DisasterRecoveryAgentPipeline',
      artifactBucket,
    });

    // Source stage
    const sourceOutput = new codepipeline.Artifact();
    const sourceAction = new codepipeline_actions.CodeStarConnectionsSourceAction({
      actionName: 'GitHub_Source',
      owner: 'your-github-org',
      repo: 'disaster-recovery-agent',
      branch: 'main',
      connectionArn: 'arn:aws:codestar-connections:region:account:connection/your-connection-id',
      output: sourceOutput,
    });

    pipeline.addStage({
      stageName: 'Source',
      actions: [sourceAction],
    });

    // Build stage
    const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        privileged: true,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: '16',
            },
            commands: [
              'npm install -g aws-cdk',
              'npm ci',
            ],
          },
          build: {
            commands: [
              'npm run build',
              'npm run test',
              'cdk synth',
            ],
          },
        },
        artifacts: {
          'base-directory': 'cdk.out',
          files: ['**/*'],
        },
      }),
    });

    const buildOutput = new codepipeline.Artifact();
    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'Build',
      project: buildProject,
      input: sourceOutput,
      outputs: [buildOutput],
    });

    pipeline.addStage({
      stageName: 'Build',
      actions: [buildAction],
    });

    // Deploy to Dev stage
    const deployDevAction = new codepipeline_actions.CloudFormationCreateUpdateStackAction({
      actionName: 'Deploy_Core_Dev',
      templatePath: buildOutput.atPath('DisasterRecoveryCore.template.json'),
      stackName: 'DisasterRecoveryCore-Dev',
      adminPermissions: true,
    });

    const deployLambdasDevAction = new codepipeline_actions.CloudFormationCreateUpdateStackAction({
      actionName: 'Deploy_Lambdas_Dev',
      templatePath: buildOutput.atPath('DisasterRecoveryLambdas.template.json'),
      stackName: 'DisasterRecoveryLambdas-Dev',
      adminPermissions: true,
    });

    pipeline.addStage({
      stageName: 'Deploy_Dev',
      actions: [deployDevAction, deployLambdasDevAction],
    });

    // Test stage
    const testProject = new codebuild.PipelineProject(this, 'TestProject', {
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            commands: [
              'pip install pytest boto3 moto',
            ],
          },
          build: {
            commands: [
              'cd test',
              'pytest -xvs',
            ],
          },
        },
      }),
    });

    const testAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'Test',
      project: testProject,
      input: sourceOutput,
    });

    pipeline.addStage({
      stageName: 'Test',
      actions: [testAction],
    });

    // Manual approval stage
    const manualApprovalAction = new codepipeline_actions.ManualApprovalAction({
      actionName: 'Approve',
    });

    pipeline.addStage({
      stageName: 'Approve',
      actions: [manualApprovalAction],
    });

    // Deploy to Prod stage
    const deployCoreAction = new codepipeline_actions.CloudFormationCreateUpdateStackAction({
      actionName: 'Deploy_Core_Prod',
      templatePath: buildOutput.atPath('DisasterRecoveryCore.template.json'),
      stackName: 'DisasterRecoveryCore-Prod',
      adminPermissions: true,
    });

    const deployLambdasAction = new codepipeline_actions.CloudFormationCreateUpdateStackAction({
      actionName: 'Deploy_Lambdas_Prod',
      templatePath: buildOutput.atPath('DisasterRecoveryLambdas.template.json'),
      stackName: 'DisasterRecoveryLambdas-Prod',
      adminPermissions: true,
    });

    const deployWorkflowsAction = new codepipeline_actions.CloudFormationCreateUpdateStackAction({
      actionName: 'Deploy_Workflows_Prod',
      templatePath: buildOutput.atPath('DisasterRecoveryWorkflows.template.json'),
      stackName: 'DisasterRecoveryWorkflows-Prod',
      adminPermissions: true,
    });

    pipeline.addStage({
      stageName: 'Deploy_Prod',
      actions: [deployCoreAction, deployLambdasAction, deployWorkflowsAction],
    });

    // Output the pipeline ARN
    new cdk.CfnOutput(this, 'PipelineArn', {
      value: pipeline.pipelineArn,
      description: 'ARN of the CI/CD Pipeline',
      exportName: 'DisasterRecoveryPipelineArn',
    });
  }
}
