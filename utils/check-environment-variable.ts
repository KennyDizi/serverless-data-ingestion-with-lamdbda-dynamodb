/*
* Check if the environment variables are set
* @param args - Environment variables to check
* @throws Error if any of the environment variables is not set
* @returns void
* */
export function checkEnvVariables(...args: string[]) {
    const missingVariables = args.filter(arg => process.env[arg] === undefined);
    if (missingVariables.length > 0) {
        throw new Error(`The following environment variables are not set yet: ${missingVariables.join(', ')}. Please set them in .env file or pipeline environments.`);
    }
};

/*
* Check if the environment is production
* @param environment - The environment to check
* @returns boolean
* */
export function isProduction(environment: string) {
    return environment === 'production';
}
