CREATE TABLE `polarWebhookEvent` (
	`eventId` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payloadJson` text NOT NULL,
	`receivedAt` integer NOT NULL,
	`processedAt` integer,
	`processError` text
);
--> statement-breakpoint
CREATE TABLE `subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`polarSubscriptionId` text NOT NULL,
	`polarCustomerId` text NOT NULL,
	`polarProductId` text NOT NULL,
	`tier` text NOT NULL,
	`status` text NOT NULL,
	`currentPeriodStart` integer,
	`currentPeriodEnd` integer,
	`cancelAtPeriodEnd` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_polarSubscriptionId_unique` ON `subscription` (`polarSubscriptionId`);--> statement-breakpoint
CREATE INDEX `idx_subscription_user_status` ON `subscription` (`userId`, `status`);