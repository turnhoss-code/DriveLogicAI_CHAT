/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  size?: string;
  webViewLink?: string;
}

/**
 * Creates a new file in Google Drive with the specified name, mimeType, and content.
 * Uses a robust two-step approach:
 * 1. Create the file metadata.
 * 2. Upload the file content via PATCH.
 */
export async function createDriveFile(
  accessToken: string,
  name: string,
  mimeType: string,
  content: string
): Promise<GoogleDriveFile> {
  // Step 1: Create the metadata
  const metaResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType,
    }),
  });

  if (!metaResponse.ok) {
    const errorDetails = await metaResponse.text();
    throw new Error(`Failed to create file metadata: ${metaResponse.statusText} - ${errorDetails}`);
  }

  const fileData = await metaResponse.json();
  const fileId = fileData.id;

  // Step 2: Upload the actual content
  const contentResponse = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': mimeType,
      },
      body: content,
    }
  );

  if (!contentResponse.ok) {
    const errorDetails = await contentResponse.text();
    throw new Error(`Failed to upload file content: ${contentResponse.statusText} - ${errorDetails}`);
  }

  return await contentResponse.json();
}

/**
 * Lists files created by DriveLogicAI in Google Drive.
 */
export async function listDriveFiles(accessToken: string): Promise<GoogleDriveFile[]> {
  const q = encodeURIComponent("name contains 'drivelogic' and trashed = false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,createdTime,size,webViewLink)&orderBy=createdTime%20desc`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorDetails = await response.text();
    throw new Error(`Failed to list Drive files: ${response.statusText} - ${errorDetails}`);
  }

  const data = await response.json();
  return data.files || [];
}

/**
 * Deletes a file from Google Drive.
 */
export async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorDetails = await response.text();
    throw new Error(`Failed to delete Drive file: ${response.statusText} - ${errorDetails}`);
  }
}

/**
 * Downloads the content of a file from Google Drive.
 */
export async function downloadDriveFile(accessToken: string, fileId: string): Promise<string> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorDetails = await response.text();
    throw new Error(`Failed to download Drive file: ${response.statusText} - ${errorDetails}`);
  }

  return await response.text();
}
