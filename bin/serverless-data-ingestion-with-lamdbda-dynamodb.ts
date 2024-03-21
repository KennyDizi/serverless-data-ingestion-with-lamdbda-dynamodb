#!/usr/bin/env node
import 'source-map-support/register';

import * as cdk from 'aws-cdk-lib';
import * as dotenv from 'dotenv';
import { ServerlessDataIngestionWithLamdbdaDynamodbStackProps } from '../lib/ServerlessDataIngestionWithLamdbdaDynamodbStackProps';
import { ServerlessDataIngestionWithLamdbdaDynamodbStack } from '../lib/serverless-data-ingestion-with-lamdbda-dynamodb-stack';
import { checkEnvVariables } from '../utils/check-environment-variable';

dotenv.config(); // Load environment variables from .env file
const app = new cdk.App();

const { CDK_DEFAULT_ACCOUNT: account, CDK_DEFAULT_REGION: region } = process.env;

const cdkRegions = process.env.CDK_DEPLOY_REGIONS?.split(',') ?? [region]; // Parsing comma separated list of regions
const deployEnvironments = process.env.ENVIRONMENTS?.split(',') ?? ['development']; // Parsing comma separated list of environments

// check APP_NAME variable
checkEnvVariables('APP_NAME', 'DATA_INGESTION_API_KEY');
const appName = process.env.APP_NAME!;

for (const deployEnvironment of deployEnvironments) {
    for (const cdkRegion of cdkRegions) {
        const stackProps: ServerlessDataIngestionWithLamdbdaDynamodbStackProps = {
            resourcePrefix: `${appName}-${deployEnvironment}`,
            env: {
                region: cdkRegion,
                account,
            },
            deployRegion: cdkRegion,
            deployEnvironment,
            appName,
            DATA_INGESTION_API_KEY: process.env.DATA_INGESTION_API_KEY!,
        };
        new ServerlessDataIngestionWithLamdbdaDynamodbStack(app, `ServerlessDataIngestionWithLamdbdaDynamodbStack`, {
            ...stackProps,
            stackName: `${appName}-${deployEnvironment}-ServerlessDataIngestionWithLamdbdaDynamodbStack`,
            description: `ServerlessDataIngestionWithLamdbdaDynamodbStack for ${appName} in ${cdkRegion} ${deployEnvironment}.`,
        });
    }
}

app.synth();
