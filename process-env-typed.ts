/**
 * Interface representing the environment variables related to S3 bucket configurations.
 *
 * @property {string} CDK_DEPLOY_REGIONS - The regions where the CDK application will be deployed.
 * @property {string} ENVIRONMENTS - A comma-separated list of environments for the application, e.g., "dev,prod".
 * @property {string} APP_NAME - The name of the application.
 */
export interface IEnvTypes {
    readonly CDK_DEPLOY_REGIONS: string;
    readonly ENVIRONMENTS: string;
    readonly APP_NAME: string;
}
