import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dotenv from "dotenv";

// environment variables
dotenv.config();

const BASE_URL = "https://developer.nps.gov/api/v1";
const API_KEY = process.env.API_KEY || "Key Not Supplied";

const headers = {
  'Content-Type': 'application/json',
  'X-Api-Key': API_KEY
}

interface ParamsType {
  start: Number
  limit: Number
  parkCode?: String
  stateCode?: String
}

/**********************************************************************************************************************
 *  This function will perform the fetch given an endpoint and params; the NPS endpoints are all GET methods
 *********************************************************************************************************************/
export const fetchData = async (endpoint: string, params: any | {}) => {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.search = new URLSearchParams(params).toString();

  const options = {
    method: 'GET',
    headers
  };

    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Error fetching data:", error);
    }
}

/**********************************************************************************************************************
 *  This function will fetch all of the national parks and return the code, states array, and full name
 *  These codes can then be used to fetch detailed information for specific parks and/or states
 *********************************************************************************************************************/
export const fetchAllParkCodes = async () => {
  let codes = [];
  let start = 0;
  const limit = 50;
  let data;
  let paginating = true;

  while (paginating) {
    const body = await fetchData('parks', { start, limit });
    data = body.data;
    // @ts-ignore
    codes.push(...data.map(item => ({ parkCode: item.parkCode, fullName: item.fullName, states: item.states.split(',') })));
    start += limit;
    if (body.total < start) {
      paginating = false;
    }
  }
  return codes;
}

/**********************************************************************************************************************
 *  This function will fetch details for a national park given a park code
 *********************************************************************************************************************/
export const fetchParkDetails = async (parkCode: String) => {
  let start = 0;
  const limit = 50;
  let data = []
  let paginating = true;
  let params: ParamsType = { start, limit, parkCode };

  while (paginating) {
    const body = await fetchData('parks', params);
    data.push(...body.data);
    start += limit;
    if (body.total < start) {
      paginating = false;
    }
  }
  return data;
}

/**********************************************************************************************************************
 *  This function will return a list of parks for a given state
 *********************************************************************************************************************/
export const fetchParksList = async (stateCode: String) => {
  let start = 0;
  const limit = 50;
  let data = []
  let paginating = true;
  let params: ParamsType = { start, limit, stateCode };

  while (paginating) {
    const body = await fetchData('parks', params);
    data.push(...body.data);
    start += limit;
    if (body.total < start) {
      paginating = false;
    }
  }
  return data.map(item => ({ fullName: item.fullName, description: item.description, parkCode: item.parkCode }));
}

/**********************************************************************************************************************
 *  MCP Server for National Park Services data
 *  - retrieve list of parks given a state
 *  - get details about a park given a park code
 *********************************************************************************************************************/
const server = new McpServer(
  {
    name: "nps",
    version: "1.0.0",
  }
);

// tool for fetching park details
server.tool(
  "park-details",
  "Get details for a specific national park",
  {
    parkCode: z.string().describe("National Park lookup code"),
  },
  async ({ parkCode }) => {
    const data = await fetchParkDetails(parkCode);
    return { content: [{ type: "text", text: JSON.stringify(data) }] }
  }
);

server.tool(
  "park-list",
  "Get list of parks for a given state",
  {
    stateCode: z.string().describe("Two-letter state code")
  },
  async ({ stateCode }) => {
    const data = await fetchParksList(stateCode);
    return { content: [{ type: "text", text: JSON.stringify(data) }] }
  }
);

server.prompt(
  "parks-by-state",
  { stateCode: z.string() },
  ({ stateCode }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `What National Parks are in the state of ${stateCode}`
      }
    }]
  })
);

server.prompt(
  "details-for-park",
  { park: z.string() },
  ({ park }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Give me details about ${park}`
      }
    }]
  })
);

// connect and start receiving messages
const transport = new StdioServerTransport();
await server.connect(transport);
