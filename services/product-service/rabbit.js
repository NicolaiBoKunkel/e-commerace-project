const amqp = require("amqplib");
const Product = require("./models/Product");

let channel;

/**
 * Initializes the RabbitMQ connection and sets up the consumer
 * for the Product Service to handle ORDER_SHIPPED events.
 *
 * On receiving an ORDER_SHIPPED event, it attempts to reduce stock
 * for each product in the order. If stock is insufficient for any product,
 * a STOCK_UPDATE_FAILED event is published as compensation.
 *
 * This function contributes to the Saga pattern for distributed transaction coordination.
 */
async function startRabbitMQ() {
  try {
    const connection = await amqp.connect(process.env.RABBITMQ_URL || "amqp://rabbitmq");
    channel = await connection.createChannel();

    // Declare a fanout exchange for broadcasting events
    await channel.assertExchange("order_events", "fanout", { durable: true });

    // Each service declares and binds its own queue
    const queue = "order_events_product";
    await channel.assertQueue(queue, { durable: true });
    await channel.bindQueue(queue, "order_events", "");

    console.log(`Product Service listening to exchange via queue: ${queue}`);

    channel.consume(queue, async (msg) => {
      if (!msg) return;

      /** @type {{ type: string, userId: string, orderId: string, products: Array<{ productId: string, quantity: number }> }} */
      let event;

      try {
        event = JSON.parse(msg.content.toString());
        console.log("Product Service received event:", event);
      } catch (parseErr) {
        console.error("Failed to parse message:", parseErr);
        channel.ack(msg);
        return;
      }

      // Handle stock deduction on ORDER_SHIPPED
      if (event.type === "ORDER_SHIPPED" && Array.isArray(event.products)) {
        const failedProducts = [];

        for (const item of event.products) {
          try {
            const product = await Product.findById(item.productId);
            if (product && typeof item.quantity === "number") {
              if (product.stock >= item.quantity) {
                const original = product.stock;
                product.stock -= item.quantity;
                await product.save();
                console.log(`Reduced stock of '${product.name}' from ${original} to ${product.stock}`);
              } else {
                console.warn(
                  `Insufficient stock for '${product.name}' — requested: ${item.quantity}, available: ${product.stock}`
                );
                failedProducts.push({
                  productId: item.productId,
                  requested: item.quantity,
                  available: product.stock,
                });
              }
            }
          } catch (err) {
            console.error(`Failed to update stock for product ${item.productId}:`, err.message);
          }
        }

        // If stock deduction failed for any product, publish a compensation event
        if (failedProducts.length > 0) {
          const compensationEvent = {
            type: "STOCK_UPDATE_FAILED",
            orderId: event.orderId || null,
            userId: event.userId,
            failedProducts,
          };

          // Send compensation event to the fanout exchange
          channel.publish("order_events", "", Buffer.from(JSON.stringify(compensationEvent)), {
            persistent: true,
          });

          console.log("Published STOCK_UPDATE_FAILED event:", compensationEvent);
        }
      }

      channel.ack(msg);
    });
  } catch (err) {
    console.error("Product Service failed to start RabbitMQ consumer:", err.message);
  }
}

module.exports = { startRabbitMQ };
