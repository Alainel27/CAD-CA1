import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  actorKey,
  ddb,
  isRoleItem,
  movieKey,
  parseId,
  tableName,
  toRole,
} from "../shared/db";
import { response } from "../shared/http";
import { logRequest } from "../shared/request-logger";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  logRequest(event);

  const movieId = parseId(event.pathParameters?.movieID);
  if (movieId === undefined) {
    return response(400, { message: "movieID must be a positive integer" });
  }

  //Optional Filter : ?actorID=123
  //Reference : https://tutors.dev/lab/cloud-app-dev-setu-waterford/topic03/book-2/BasicREST
  try {
    const actorParam = event.queryStringParameters?.actor;
    if (actorParam !== undefined) {
      const actorId = parseId(actorParam);
      if (actorId === undefined) {
        return response(400, { message: "actor must be a positive integer" });
      }
      const commandOutput = await ddb.send(
        new GetCommand({
          TableName: tableName,
          Key: {
            PK: movieKey(movieId), SK: actorKey(actorId)
          },
        })
      );
      if (!commandOutput.Item || !isRoleItem(commandOutput.Item)) {
        return response(404, { message: `Role not found for actor ${actorId} in movie ${movieId}`, });
      }
      return response(200, { data: toRole(commandOutput.Item) });
    }

    const queryResult = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": movieKey(movieId) },
        // ExclusiveStartKey: lastKey,
      })
    );

    const resultItems = queryResult.Items ?? [];
    return response(200, { data: resultItems.filter(isRoleItem).map(toRole) });
  } catch (err) {
    console.error("DynamoDB error:", err);
    return response(500, {
      message: "Internal server error",
    });
  }
};
