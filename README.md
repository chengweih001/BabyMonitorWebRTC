# Baby Monitor Web App

This is a simple baby monitor web application built using WebRTC. It allows you to stream video from a host device (e.g., a mobile phone) to a client device (e.g., a computer).

## Prerequisites

- A web browser that supports WebRTC (e.g., Chrome, Firefox)
- Node.js

## How to Use

1.  Run the WebSocket server (see instructions below).
2.  Open a web browser and navigate to `http://localhost:8080`.
3.  Open the same URL in another browser window or tab.
4.  In one browser window, click the "Host" button to start the host mode.
    -   The browser will prompt you to grant camera access. Allow the access.
5.  In the other browser window, click the "Client" button to start the client mode.
6.  The video stream from the host device should now be visible in the client browser window.

**Note:** This implementation uses a WebSocket server for signaling.

## Running the WebSocket Server

1.  Make sure you have Node.js installed.
2.  Open a terminal and navigate to the project directory.
3.  Run the command `node server.js`.
