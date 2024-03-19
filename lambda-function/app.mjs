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
import { v4 as uuidv4 } from "uuid";

import { AMQPClient } from "@cloudamqp/amqp-client";

const secret_name = "rabbitmq-credentials";

const secretsClient = new SecretsManagerClient({
  region: "eu-north-1",
});

const queuePaymentRequest = "paymentRequest";
const queuePaymentResponse = "paymentResponse";

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
    };
  }

  const secret = JSON.parse(data.SecretString);
  const { username, password, host } = secret;

  // Connect to RabbitMQ server
  const amqp = new AMQPClient(`amqps://${username}:${password}@${host}`);
  try {
    const conn = await amqp.connect();

    // Create a channel and assert the queue
    const channel = await conn.channel();
    const queue = await channel.queue(queuePaymentResponse, { durable: true });

    console.log("Connected to RabbitMQ server");

    // Assuming the event contains messages from the queue
    console.log(event.rmqMessagesByQueue[`${queuePaymentRequest}::/`]);
    const messages = event.rmqMessagesByQueue[`${queuePaymentRequest}::/`].map(
      (message) => message.data
    );


    // Process and respond to each message
    messages.forEach(async (message) => {
      const paymentRequestId = message;
      const paymentConfirmationId = uuidv4();
      const outputMessage = JSON.stringify({
        paymentRequestId,
        paymentConfirmationId,
      });

      await queue.publish(outputMessage);
      console.log(
        `Sent payment confirmation ${paymentConfirmationId} for payment request ${paymentRequestId}`
      );
    });

    // Close the channel and the connection
    await channel.close();
    await conn.close();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Processed messages successfully` }),
    };
  } catch (err) {
    console.error(err);
    err.connection.close();
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Failed to process messages" }),
    };
  }
};
