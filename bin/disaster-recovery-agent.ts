#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CoreInfrastructureStack } from '../lib/core-infrastructure-stack';
import { LambdaFunctionsStack } from '../lib/lambda-functions-stack';
import { StepFunctionsStack } from '../lib/step-functions-stack';
import { NotificationStack } from '../lib/notification-stack';
import { ApiStack } from '../lib/api-stack';
import { IntelligenceLayerStack } from '../lib/intelligence-layer-stack';
import { MonitoringStack } from '../lib/monitoring-stack';
import { CiCdPipelineStack } from '../lib/cicd-pipeline-stack';

const app = new cdk.App();

// Define environment
const env = { 
  account: process.env.CDK_DEFAULT_ACCOUNT, 
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
};

// Create stacks
const coreStack = new CoreInfrastructureStack(app, 'DisasterRecoveryCore', { env });
const lambdaStack = new LambdaFunctionsStack(app, 'DisasterRecoveryLambdas', coreStack, { env });
const stepFunctionsStack = new StepFunctionsStack(app, 'DisasterRecoveryWorkflows', lambdaStack, { env });
const notificationStack = new NotificationStack(app, 'DisasterRecoveryNotifications', lambdaStack, { env });
const intelligenceStack = new IntelligenceLayerStack(app, 'DisasterRecoveryIntelligence', lambdaStack, { env });
const apiStack = new ApiStack(app, 'DisasterRecoveryAPI', lambdaStack, { env });
const monitoringStack = new MonitoringStack(app, 'DisasterRecoveryMonitoring', lambdaStack, stepFunctionsStack, { env });

// Add CI/CD pipeline if not in dev environment
if (process.env.DEPLOY_PIPELINE === 'true') {
  new CiCdPipelineStack(app, 'DisasterRecoveryCiCdPipeline', { env });
}

// Add dependencies
lambdaStack.addDependency(coreStack);
stepFunctionsStack.addDependency(lambdaStack);
notificationStack.addDependency(lambdaStack);
intelligenceStack.addDependency(lambdaStack);
apiStack.addDependency(lambdaStack);
monitoringStack.addDependency(lambdaStack);
monitoringStack.addDependency(stepFunctionsStack);
