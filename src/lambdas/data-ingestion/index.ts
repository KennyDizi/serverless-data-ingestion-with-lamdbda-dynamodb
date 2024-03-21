import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { returnResult } from './http-request-utils';
import { StatusCodes } from 'http-status-codes';

const SERVERLESS_DATA_INGESTION_QUEUE_URL = process.env.SERVERLESS_DATA_INGESTION_QUEUE_URL;
const SERVERLESS_DATA_INGESTION_FAILURE_QUEUE_URL = process.env.SERVERLESS_DATA_INGESTION_FAILURE_QUEUE_URL;
const DATA_INGESTION_API_KEY = process.env.DATA_INGESTION_API_KEY;

const sqsClient = new SQSClient({});

/**
 * The `handler` function processes incoming API Gateway events, validates the API key,
 * parses the message from the request body, and sends it to an SQS queue. If the process
 * fails at any point, it sends the error details to a failure queue. It uses correlation IDs
 * for tracking and logs the start, end, and any errors that occur during the process.
 *
 * @param {APIGatewayProxyEvent} event - The event object containing the HTTP request information.
 * @returns {Promise<APIGatewayProxyResult>} A promise that resolves to the result of the HTTP response.
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const correlationId = uuidv4();
    const method = 'message-ingestion.handler';
    const prefix = `${correlationId} - ${method}`;
    console.log(`${prefix} - started.`);

    try {
        // check if the event headers contain the key 'x-api-key' and value of the key is equal to the value of the environment variable 'DATA_INGESTION_API_KEY'
        const apiKey = event.headers['x-api-key'];
        if (apiKey !== DATA_INGESTION_API_KEY) {
            return returnResult(StatusCodes.UNAUTHORIZED, `Unauthorized. CorrelationId: ${correlationId}.`);
        }

        // validate the request body
        const message = JSON.parse(event.body!);
        if (message === undefined) {
            return returnResult(StatusCodes.BAD_REQUEST, `Invalid request. Missing message body. CorrelationId: ${correlationId}.`);
        }

        const sqsMessage = {
            MessageBody: JSON.stringify({ correlationId, message }),
            QueueUrl: SERVERLESS_DATA_INGESTION_QUEUE_URL,
        };
        await sqsClient.send(new SendMessageCommand(sqsMessage));

        return returnResult(StatusCodes.OK, `Message ingested. CorrelationId: ${correlationId}.`);
    } catch (error) {
        console.error(`${prefix} - error:`, error);
        // send to failure queue
        const sqsMessage = {
            MessageBody: JSON.stringify({ correlationId, error, message: event.body }),
            QueueUrl: SERVERLESS_DATA_INGESTION_FAILURE_QUEUE_URL,
        };
        await sqsClient.send(new SendMessageCommand(sqsMessage));
        return returnResult(StatusCodes.INTERNAL_SERVER_ERROR, `Internal server error. CorrelationId: ${correlationId}. Error message: ${error}.`);
    } finally {
        console.log(`${prefix} - finished.`);
    }
};
