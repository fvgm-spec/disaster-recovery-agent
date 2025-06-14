# Disaster Recovery Agent

An emergency response system that uses AWS Lambda as an MCP server to help emergency teams, with integration of Step Functions and event-driven architecture.

## Architecture Overview

1. **Event Ingestion Layer**
   - Amazon EventBridge as the central event bus
   - Multiple event sources (IoT sensors, weather alerts, manual triggers)

2. **Processing & Orchestration Layer**
   - AWS Lambda as the MCP (Mission Control Protocol) server
   - AWS Step Functions for complex emergency response workflows

3. **Intelligence Layer**
   - Amazon Bedrock for AI-powered decision support
   - Amazon Comprehend for natural language processing of emergency reports

4. **Response Coordination Layer**
   - Amazon SNS/SQS for notifications and task distribution
   - Amazon DynamoDB for tracking emergency status and resources

5. **Visualization & Interaction Layer**
   - Amazon API Gateway for mobile/web interfaces
   - Amazon Location Service for geospatial tracking

## Project Structure

```
disaster-recovery-agent/
├── bin/                           # CDK app entry point
├── lib/                           # CDK stack definitions
│   ├── core-infrastructure-stack.ts
│   ├── lambda-functions-stack.ts
│   ├── step-functions-stack.ts
│   ├── notification-stack.ts
│   ├── intelligence-layer-stack.ts
│   ├── api-stack.ts
│   ├── monitoring-stack.ts
│   └── cicd-pipeline-stack.ts
├── lambda/                        # Lambda function code
│   ├── mcp-server/
│   ├── emergency-assessment/
│   ├── resource-allocation/
│   ├── notification/
│   └── report-generation/
└── step-functions/                # Step Functions workflow definitions
    ├── natural-disaster.json
    ├── infrastructure-failure.json
    └── security-incident.json
```

## Getting Started

### Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js 14.x or later
- AWS CDK installed (`npm install -g aws-cdk`)

### Installation

1. Clone the repository
```bash
git clone https://github.com/your-org/disaster-recovery-agent.git
cd disaster-recovery-agent
```

2. Install dependencies
```bash
npm install
```

3. Bootstrap CDK (if not already done)
```bash
cdk bootstrap
```

4. Deploy the stacks
```bash
cdk deploy --all
```

## Workflow Types

The system supports three main types of emergency workflows:

1. **Natural Disaster Response**
   - Evacuation coordination
   - Resource allocation
   - Damage assessment

2. **Infrastructure Failure**
   - System isolation
   - Failover activation
   - Service restoration

3. **Security Incident**
   - Threat containment
   - System protection
   - Forensic analysis

## Key Components

### Lambda MCP Server

The Lambda MCP server acts as the central coordination point for emergency teams. It processes incoming emergency data, triggers appropriate response workflows, and provides real-time status updates.

### Step Functions Workflows

Different workflows are defined for various emergency scenarios, orchestrating the response process from initial assessment to resolution.

### EventBridge Rules

EventBridge rules route different types of emergencies to the appropriate handlers based on event patterns.

### Amazon Bedrock Integration

Amazon Bedrock is used to analyze emergency situations, generate response recommendations, and provide natural language interfaces for emergency teams.

## Development

### Adding a New Workflow Type

1. Create a new workflow definition in the `step-functions` directory
2. Update the `WORKFLOW_MAPPING` in the MCP server Lambda function
3. Add the workflow to the `StepFunctionsStack`

### Testing

Run unit tests:
```bash
npm test
```

## Deployment

The project includes a CI/CD pipeline for automated deployment:

1. Changes pushed to the repository trigger the pipeline
2. Code is built and tested
3. Infrastructure is deployed to the development environment
4. After approval, changes are deployed to production

## Monitoring

The system includes CloudWatch dashboards and alarms for monitoring:

- Lambda function performance
- Step Functions workflow executions
- DynamoDB table operations
- API Gateway requests

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributors

- Your Name - Initial work
