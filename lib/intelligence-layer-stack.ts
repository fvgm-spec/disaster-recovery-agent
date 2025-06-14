import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { LambdaFunctionsStack } from './lambda-functions-stack';

export class IntelligenceLayerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, lambdaStack: LambdaFunctionsStack, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create IAM role for Bedrock access
    const bedrockAccessRole = new iam.Role(this, 'BedrockAccessRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Role for accessing Amazon Bedrock services',
    });

    // Add Bedrock permissions
    bedrockAccessRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'bedrock:InvokeModel',
        'bedrock:ListFoundationModels',
        'bedrock:GetFoundationModel'
      ],
      resources: ['*'] // In production, scope this down to specific models
    }));

    // Add Comprehend permissions for NLP
    bedrockAccessRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'comprehend:DetectEntities',
        'comprehend:DetectKeyPhrases',
        'comprehend:DetectSentiment',
        'comprehend:ClassifyDocument'
      ],
      resources: ['*']
    }));

    // Create a Lambda layer for AI utilities
    const aiUtilsLayer = new lambda.LayerVersion(this, 'AIUtilsLayer', {
      code: lambda.Code.fromAsset('lambda/layers/ai-utils'),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_9],
      description: 'Common utilities for AI/ML operations',
    });

    // Create a Lambda function for emergency situation analysis
    const situationAnalysisFunction = new lambda.Function(this, 'SituationAnalysisFunction', {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset('lambda/situation-analysis'),
      role: bedrockAccessRole,
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      layers: [aiUtilsLayer],
      environment: {
        BEDROCK_MODEL_ID: 'anthropic.claude-v2',
        COMPREHEND_LANGUAGE_CODE: 'en'
      }
    });

    // Create a Lambda function for resource recommendation
    const resourceRecommendationFunction = new lambda.Function(this, 'ResourceRecommendationFunction', {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset('lambda/resource-recommendation'),
      role: bedrockAccessRole,
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      layers: [aiUtilsLayer],
      environment: {
        BEDROCK_MODEL_ID: 'anthropic.claude-v2'
      }
    });

    // Update the assessment function to use the AI functions
    lambdaStack.assessmentFunction.addEnvironment('SITUATION_ANALYSIS_FUNCTION_ARN', situationAnalysisFunction.functionArn);
    lambdaStack.assessmentFunction.addEnvironment('RESOURCE_RECOMMENDATION_FUNCTION_ARN', resourceRecommendationFunction.functionArn);

    // Grant permissions to invoke the AI functions
    situationAnalysisFunction.grantInvoke(lambdaStack.assessmentFunction);
    resourceRecommendationFunction.grantInvoke(lambdaStack.assessmentFunction);
    resourceRecommendationFunction.grantInvoke(lambdaStack.resourceAllocationFunction);

    // Output the function ARNs
    new cdk.CfnOutput(this, 'SituationAnalysisFunctionArn', {
      value: situationAnalysisFunction.functionArn,
      description: 'ARN of the Situation Analysis Function',
      exportName: 'SituationAnalysisFunctionArn',
    });

    new cdk.CfnOutput(this, 'ResourceRecommendationFunctionArn', {
      value: resourceRecommendationFunction.functionArn,
      description: 'ARN of the Resource Recommendation Function',
      exportName: 'ResourceRecommendationFunctionArn',
    });
  }
}
