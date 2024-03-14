/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Context doc: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html
 * @param {Object} context
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 *
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const secret_name = "rabbitmq-credentials";

const secretsClient = new SecretsManagerClient({
  region: "eu-north-1",
});

export const lambdaHandler = async (event, context) => {
  let data;

  // Retrieve secret for RabbitMQ credentials
  try {
    data = await secretsClient.send(
      new GetSecretValueCommand({
        SecretId: secret_name,
      })
    );
  } catch (error) {
    // For a list of exceptions thrown, see
    // https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_GetSecretValue.html
    // Log the error
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: `Error retrieving RabbitMQ credentials: \n ${error}`,
      }),
    }
  }

  const secret = JSON.parse(data.SecretString);
  const { username, password, host } = secret;

  const response = {
    statusCode: 200,
    body: JSON.stringify({
      message: `Hello, the secret is ${username} and ${password} and ${host}`,
    }),
  };

  return response;
};