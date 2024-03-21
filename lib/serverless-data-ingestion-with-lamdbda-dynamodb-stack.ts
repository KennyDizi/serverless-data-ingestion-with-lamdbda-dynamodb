import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LlrtFunction } from 'cdk-lambda-llrt';
import { HttpMethod } from "aws-cdk-lib/aws-lambda";
import { ServerlessDataIngestionWithLamdbdaDynamodbStackProps } from './ServerlessDataIngestionWithLamdbdaDynamodbStackProps';
import { Billing, TableEncryptionV2 } from 'aws-cdk-lib/aws-dynamodb';

export class ServerlessDataIngestionWithLamdbdaDynamodbStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ServerlessDataIngestionWithLamdbdaDynamodbStackProps) {
    super(scope, id, props);

    // define an sqs queue named serverlessDataIngestionQueue
    const serverlessDataIngestionQueue = new sqs.Queue(this, `${props.resourcePrefix}-serverlessDataIngestionQueue`, {
        visibilityTimeout: cdk.Duration.seconds(60), // 60 seconds
        queueName: `${props.resourcePrefix}-${props.deployRegion}-serverlessDataIngestionQueue`,
        encryption: sqs.QueueEncryption.SQS_MANAGED,
        retentionPeriod: cdk.Duration.days(14), // 14 days
        removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // define a dead-letter queue named serverlessDataIngestionDLQ
    const serverlessDataIngestionDLQ = new sqs.Queue(this, `${props.resourcePrefix}-serverlessDataIngestionDLQ`, {
        visibilityTimeout: cdk.Duration.seconds(60), // 60 seconds
        queueName: `${props.resourcePrefix}-${props.deployRegion}-serverlessDataIngestionDLQ`,
        encryption: sqs.QueueEncryption.SQS_MANAGED,
        retentionPeriod: cdk.Duration.days(14), // 14 days
        removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const dynamoDBTable = new cdk.aws_dynamodb.TableV2(this, `${props.resourcePrefix}-dataIngestion-DynamoDB`, {
      tableName: `${props.resourcePrefix}-dataIngestion-DynamoDB`,
      partitionKey: {
          name: 'PK',
          type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      sortKey: {
          name: 'SK',
          type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      billing: Billing.onDemand(),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
      encryption: TableEncryptionV2.dynamoOwnedKey(),
      deletionProtection: false,
      globalSecondaryIndexes: [{
          indexName: 'GSI1',
          partitionKey: {
              name: 'GSI1PK',
              type: cdk.aws_dynamodb.AttributeType.STRING,
          },
          sortKey: {
              name: 'GSI1SK',
              type: cdk.aws_dynamodb.AttributeType.STRING,
          },
      }],
    });

    const dataIngestionLambdaFn = new LlrtFunction(this, `${props.resourcePrefix}-dataIngestionLambdaFn`, {
        functionName: `${props.resourcePrefix}-dataIngestionLambdaFn`,
        runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
        entry: path.join(__dirname, '../src/lambdas/data-ingestion/index.ts'),
        handler: 'handler',
        environment: {
            SERVERLESS_DATA_INGESTION_QUEUE_URL: serverlessDataIngestionQueue.queueUrl,
            SERVERLESS_DATA_INGESTION_FAILURE_QUEUE_URL: serverlessDataIngestionDLQ.queueUrl,
            DATA_INGESTION_API_KEY: props.DATA_INGESTION_API_KEY,
        },
        llrtVersion: 'latest',
        role: new cdk.aws_iam.Role(this, `${props.resourcePrefix}-dataIngestionLambdaFn-Role`, {
            assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
            inlinePolicies: {
                // define serverlessDataIngestionQueuePolicy to grant this lambda function to read and delete message from serverlessDataIngestionQueue
                serverlessDataIngestionQueuePolicy: new cdk.aws_iam.PolicyDocument({
                    statements: [
                        new cdk.aws_iam.PolicyStatement({
                            actions: ['sqs:ChangeMessageVisibility', 'sqs:GetQueueAttributes', 'sqs:GetQueueUrl'],
                            resources: [serverlessDataIngestionQueue.queueArn, serverlessDataIngestionDLQ.queueArn],
                        }),
                        new cdk.aws_iam.PolicyStatement({
                            actions: ['sqs:SendMessage'],
                            resources: [serverlessDataIngestionQueue.queueArn, serverlessDataIngestionDLQ.queueArn],
                        }),
                    ],
                }),
            },
        }),
        timeout: cdk.Duration.seconds(60), // 60 seconds
        architecture: lambda.Architecture.ARM_64,
        logGroup: new cdk.aws_logs.LogGroup(this, `${props.resourcePrefix}-dataIngestionLambdaFn-LogGroup`, {
            logGroupName: `${props.resourcePrefix}-dataIngestionLambdaFn-LogGroup`,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
        }),
        memorySize: 1024,
        bundling: {
            minify: true,
            sourceMap: true,
            sourcesContent: false,
            esbuildVersion: '0.20.2',
            target: 'es2020',
            format: OutputFormat.ESM,
            forceDockerBundling: true,
        },
        projectRoot: path.join(__dirname, '../src/lambdas/data-ingestion'),
        depsLockFilePath: path.join(__dirname, '../src/lambdas/data-ingestion/package-lock.json'),
    });

    // define a lambda function to consume messages from the SQS
    const dataConsumptionLambdaFn = new LlrtFunction(this, `${props.resourcePrefix}-${props.deployRegion}-dataConsumptionLambdaFn`, {
      functionName: `${props.resourcePrefix}-dataConsumptionLambdaFn`,
      runtime: cdk.aws_lambda.Runtime.PYTHON_3_11,
      entry: path.join(__dirname, '../src/lambdas/data-consumption/index.ts'),
      handler: 'handler',
      architecture: lambda.Architecture.ARM_64,
      runtimeManagementMode: lambda.RuntimeManagementMode.AUTO,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(60), // 60 seconds
      logGroup: new cdk.aws_logs.LogGroup(this, `${props.resourcePrefix}-${props.deployRegion}-dataConsumptionLambdaFn-LogGroup`, {
          logGroupName: `${props.resourcePrefix}-${props.deployRegion}-dataConsumptionLambdaFn-LogGroup`,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
          retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      }),
      environment: {
        SERVERLESS_DATA_INGESTION_QUEUE_URL: serverlessDataIngestionQueue.queueUrl,
        DYNAMODB_CUSTOMER_PROFILE_TABLE_NAME: dynamoDBTable.tableName,
      },
      role: new cdk.aws_iam.Role(this, `${props.resourcePrefix}-${props.deployRegion}-dataConsumptionLambdaFn-Role`, {
          assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
          managedPolicies: [
              cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
          ],
          inlinePolicies: {
              // define serverlessDataIngestionQueuePolicy to grant this lambda function to read and delete message from serverlessDataIngestionQueue
              serverlessDataIngestionQueuePolicy: new cdk.aws_iam.PolicyDocument({
                statements: [
                    new cdk.aws_iam.PolicyStatement({
                        actions: ['sqs:ReceiveMessage'],
                        resources: [serverlessDataIngestionQueue.queueArn],
                    }),
                    new cdk.aws_iam.PolicyStatement({
                        actions: ['sqs:ChangeMessageVisibility', 'sqs:GetQueueAttributes', 'sqs:GetQueueUrl'],
                        resources: [serverlessDataIngestionQueue.queueArn],
                    }),
                    new cdk.aws_iam.PolicyStatement({
                        actions: ['sqs:DeleteMessage'],
                        resources: [serverlessDataIngestionQueue.queueArn],
                    }),
                    new cdk.aws_iam.PolicyStatement({
                        actions: ['sqs:SendMessage'],
                        resources: [serverlessDataIngestionQueue.queueArn],
                    }),
                ],
              }),
              dynamoDBPolicy: new cdk.aws_iam.PolicyDocument({
                statements: [
                    new cdk.aws_iam.PolicyStatement({
                        actions: ['dynamodb:GetItem', 'dynamodb:TransactWriteItems', 'dynamodb:PutItem'],
                        resources: [dynamoDBTable.tableArn],
                    }),
                ],
              }),
          },
      }),
      bundling: {
        minify: true,
        sourceMap: true,
        sourcesContent: false,
        esbuildVersion: '0.20.2',
        target: 'es2020',
        format: OutputFormat.ESM,
        forceDockerBundling: true,
      },
      projectRoot: path.join(__dirname, '../src/lambdas/data-consumption'),
      depsLockFilePath: path.join(__dirname, '../src/lambdas/data-consumption/package-lock.json'),
    });

    // grant permission for textractResultQueue to invoke dataConsumptionLambdaFn
    dataConsumptionLambdaFn.addPermission('AllowSQSInvocation', {
      action: 'lambda:InvokeFunction',
      principal: new iam.ServicePrincipal('sqs.amazonaws.com'),
      sourceArn: serverlessDataIngestionQueue.queueArn,
    });

    // Add the SQS queue as an event source for the dataConsumptionLambdaFn function
    dataConsumptionLambdaFn.addEventSource(new lambdaEventSources.SqsEventSource(serverlessDataIngestionQueue, {
        batchSize: 10, // Set the batch size to 10
        reportBatchItemFailures: true, // Allow functions to return partially successful responses for a batch of records.
        enabled: true,
        maxBatchingWindow: cdk.Duration.seconds(30), // 30 seconds
    }));

    // Configure Lambda Function URL
    const dataIngestionLambdaFnUrl = new cdk.aws_lambda.FunctionUrl(this, `${props.resourcePrefix}-${props.deployRegion}-dataIngestionLambdaFn-Url`, {
        function: dataIngestionLambdaFn,
        invokeMode: cdk.aws_lambda.InvokeMode.BUFFERED,
        cors: {
            allowedOrigins: ['*'],
            allowedMethods: [HttpMethod.POST],
            allowedHeaders: ['*'],
            allowCredentials: true,
        },
        authType: cdk.aws_lambda.FunctionUrlAuthType.NONE, // or AWS_IAM if you want to use IAM authentication
    });

    // export the URL of the Lambda Function
    new cdk.CfnOutput(this, `${props.resourcePrefix}-${props.deployRegion}-dataIngestionLambdaFn-Url-Export`, {
        value: dataIngestionLambdaFnUrl.url,
        exportName: `${props.resourcePrefix}-${props.deployRegion}-dataIngestionLambdaFn-Url-Export`,
        description: `The URL of the message ingestion lambda function.`,
    });
  }
}
