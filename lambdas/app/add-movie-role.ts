import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import {
  actorKey,
  ddb,
  movieKey,
  parseId,
  type Role,
  tableName
} from "../shared/db";
import { isResponse, parseJsonObject, response } from "../shared/http";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const body = parseJsonObject(event);
    if (isResponse(body)) return body;

    const movieId = parseId(String(body.movieId));
    const actorId = parseId(String(body.actorId));
    if (movieId === undefined || actorId === undefined) {
      return response(400, { message: "movieId and actorId must be positive integers" });
    }

    const { roleName, roleDescription } = body;
    if (typeof roleName !== "string" || roleName.trim() === "" ||
      typeof roleDescription !== "string" || roleDescription.trim() === "") {
      return response(400, { message: "roleName and roleDescription must be strings" });
    }

    const role: Role = {
      movieId,
      actorId,
      roleName,
      roleDescription
    };

    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            ConditionCheck: {
              TableName: tableName,
              Key: {
                PK: movieKey(movieId),
                SK: movieKey(movieId)
              },
              ConditionExpression: "attribute_exists(PK)",
            },
          },
          {
            ConditionCheck: {
              TableName: tableName,
              Key: {
                PK: actorKey(actorId),
                SK: actorKey(actorId)
              },
              ConditionExpression: "attribute_exists(PK)",
            },
          },
          {
            Put: {
              TableName: tableName,
              Item: {
                PK: movieKey(movieId),
                SK: actorKey(actorId),
                ...role
              },
              ConditionExpression: "attribute_not_exists(PK)",
            },
          },
        ],
      })
    );

    return response(201, { message: "Role added", data: role });
  } catch (err) {
    if (err instanceof TransactionCanceledException) {
      const [movieCheck, actorCheck, roleCheck] = err.CancellationReasons ?? [];
      if (movieCheck?.Code === "ConditionalCheckFailed") {
        return response(404, { message: "Movie not found" });
      } else if (actorCheck?.Code === "ConditionalCheckFailed") {
        return response(404, { message: "Actor not found" });
      } else if (roleCheck?.Code === "ConditionalCheckFailed") {
        return response(409, { message: "Role already exists for this movie and actor" });
      }
    }
    console.error("DynamoDB error:", err);
    return response(500, {
      message: "Internal server error",
    });
  }
};
