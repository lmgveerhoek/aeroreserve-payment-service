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
  console.log(`Error retrieving secret: ${error}`);
}

const secret = JSON.parse(data.SecretString);

let amqpConnection = null;
let amqpChannel = null;
let amqpQueue = null;

async function getAmqpConnection({ username, password, host }) {
  if (!amqpQueue) {
    const amqpClient = new AMQPClient(`amqps://${username}:${password}@${host}`);
    amqpConnection = await amqpClient.connect();
    // Create a channel and assert the queue
    amqpChannel = await amqpConnection.channel();
    amqpQueue = await amqpChannel.queue(queuePaymentResponse, { durable: true });
  }
  return amqpQueue;
}

async function processMessages(messages, queue) {
  return Promise.all(
    messages.map(async (message) => {
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
    })
  );
}

export const lambdaHandler = async (event, context) => {
  try {
    // Connect to RabbitMQ server
    const queue = await getAmqpConnection(secret);

    console.log("Connected to RabbitMQ server");

    // Assuming the event contains messages from the queue
    const messages = event.rmqMessagesByQueue[`${queuePaymentRequest}::/`].map(
      (message) => {
        // Decode the Base64 encoded message
        return Buffer.from(message.data, "base64").toString();
      }
    );

    // Process and respond to each message
    await processMessages(messages, queue);

    // Close the channel and the connection
    // await channel.close();
    // await conn.close();

    console.log(`Processed ${messages.length} messages successfully`);

  } catch (err) {
    console.error(err);
    if (err.connection) {
      await err.connection.close();
    }
    console.error("Failed to process messages");
  }
};

process.on('SIGTERM', async () => {
  console.info('[runtime] SIGTERM received');

  console.info('[runtime] cleaning up');
  // perform actual clean up work here. 
  await amqpChannel.close();
  await amqpConnection.close();

  console.info('[runtime] exiting');
  process.exit(0)
});
