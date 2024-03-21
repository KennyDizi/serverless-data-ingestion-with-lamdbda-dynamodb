import { APIGatewayProxyResult } from 'aws-lambda';

export function returnResult(statusCode: number, message: string, headers?: Record<string, string>): APIGatewayProxyResult {
	return returnCustomResult(
		statusCode,
		{
			message: message,
		},
		headers,
	);
}

export function returnCustomResult(statusCode: number, body: unknown, headers?: Record<string, string>): APIGatewayProxyResult {
	const response: APIGatewayProxyResult = {
		statusCode: statusCode,
		body: JSON.stringify(body),
	};
	if (headers != null) response.headers = headers;
	return response;
}
