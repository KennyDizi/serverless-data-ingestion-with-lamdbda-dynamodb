import { StackProps } from "aws-cdk-lib";

export interface ServerlessDataIngestionWithLamdbdaDynamodbStackProps extends StackProps {
    /**
     * A prefix used for naming resources to ensure uniqueness across deployments.
     */
    readonly resourcePrefix: string;
    /**
     * The AWS region where the resources will be deployed.
     */
    readonly deployRegion: string | undefined;
    /**
     * The environment (e.g., development, staging, production) for this deployment.
     */
    readonly deployEnvironment: string;
    /**
     * The name of the application. Used for resource naming and identification.
     */
    readonly appName: string;
     /**
     * The api key for the data ingestion API.
     */
     readonly DATA_INGESTION_API_KEY: string;
}
