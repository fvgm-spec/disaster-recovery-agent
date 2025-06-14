import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { LambdaFunctionsStack } from './lambda-functions-stack';

export class ApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly userPool: cognito.UserPool;

  constructor(scope: Construct, id: string, lambdaStack: LambdaFunctionsStack, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create Cognito User Pool for authentication
    this.userPool = new cognito.UserPool(this, 'EmergencyResponseUserPool', {
      selfSignUpEnabled: false,
      userPoolName: 'emergency-response-users',
      standardAttributes: {
        email: { required: true, mutable: true },
        givenName: { required: true, mutable: true },
        familyName: { required: true, mutable: true },
        phoneNumber: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Create User Pool Client
    const userPoolClient = this.userPool.addClient('EmergencyResponseAppClient', {
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
    });

    // Create API Gateway
    this.api = new apigateway.RestApi(this, 'EmergencyResponseApi', {
      restApiName: 'Emergency Response API',
      description: 'API for emergency response system',
      deployOptions: {
        stageName: 'v1',
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date', 'X-Api-Key'],
      },
    });

    // Create Cognito Authorizer
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'EmergencyResponseAuthorizer', {
      cognitoUserPools: [this.userPool],
    });

    // Create API resources
    const emergenciesResource = this.api.root.addResource('emergencies');
    const resourcesResource = this.api.root.addResource('resources');
    const teamsResource = this.api.root.addResource('teams');

    // Create Lambda integration for MCP server
    const mcpIntegration = new apigateway.LambdaIntegration(lambdaStack.mcpServerFunction, {
      proxy: true,
    });

    // Add methods to resources with authorization
    emergenciesResource.addMethod('GET', mcpIntegration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    emergenciesResource.addMethod('POST', mcpIntegration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Add a specific emergency resource
    const specificEmergencyResource = emergenciesResource.addResource('{emergencyId}');
    specificEmergencyResource.addMethod('GET', mcpIntegration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    specificEmergencyResource.addMethod('PUT', mcpIntegration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Add resources endpoints
    resourcesResource.addMethod('GET', mcpIntegration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Add teams endpoints
    teamsResource.addMethod('GET', mcpIntegration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Create a public endpoint for emergency reporting (no auth required)
    const publicReportResource = this.api.root.addResource('public-report');
    publicReportResource.addMethod('POST', mcpIntegration);

    // Output the API URL
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'URL of the Emergency Response API',
      exportName: 'EmergencyResponseApiUrl',
    });

    // Output the User Pool ID
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'ID of the Cognito User Pool',
      exportName: 'EmergencyResponseUserPoolId',
    });

    // Output the User Pool Client ID
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'ID of the Cognito User Pool Client',
      exportName: 'EmergencyResponseUserPoolClientId',
    });
  }
}
