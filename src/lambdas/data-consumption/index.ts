import { SQSEvent } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { DeleteMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

const sqsClient = new SQSClient({});

const SERVERLESS_DATA_INGESTION_QUEUE_URL = process.env.SERVERLESS_DATA_INGESTION_QUEUE_URL;

export const handler = async (event: SQSEvent): Promise<void> => {
    const correlationId = uuidv4();
    const method = 'ts-receive-result.handler';
    const prefix = `${correlationId} - ${method}`;
    console.log(`${prefix} - started.`);

    for (const record of event.Records) {
        const recordBody = JSON.parse(record.body);

        // do data processing with recordBody here

        // Delete the message from the queue after processing
        const deleteMessageCommand = new DeleteMessageCommand({
            QueueUrl: SERVERLESS_DATA_INGESTION_QUEUE_URL,
            ReceiptHandle: record.receiptHandle
        });
        try {
            await sqsClient.send(deleteMessageCommand);
        }
        catch (e) {
            console.log(`Fail to delete message in SQS: ${e}`);
            throw new Error(`Fail to delete message in SQS: ${e}`);
        }
    }
};
