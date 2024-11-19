// src/app/api/submit-form/route.ts
import { google, sheets_v4 } from 'googleapis';
import { NextResponse } from 'next/server';
import { JWT } from 'google-auth-library';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

let auth: JWT | null = null;

async function initializeGoogleAuth() {
  try {
    const keyString = process.env.GOOGLE_APPLICATION_CREDENTIALS || '{}';
    const keyFile = JSON.parse(keyString as string);

    auth = new google.auth.JWT({
      email: keyFile.client_email,
      key: keyFile.private_key,
      scopes: SCOPES,
    });
  } catch (error) {
    console.error('Error initializing GoogleAuth:', error);
    auth = null;
  }
}

initializeGoogleAuth();

let sheets: sheets_v4.Sheets | PromiseLike<sheets_v4.Sheets>

async function getSheets(): Promise<sheets_v4.Sheets> {
  if (!sheets) {
    try {
      if (!auth) {
        throw new Error('GoogleAuth not initialized');
      }
      console.log('Getting auth client...');
      await auth.authorize();
      console.log('Auth client authorized successfully');

      console.log('Initializing Google Sheets API...');
      sheets = google.sheets({ version: 'v4', auth });
      console.log('Google Sheets API initialized successfully');
    } catch (error) {
      console.error('Error in getSheets:', error);
      throw new Error('Failed to initialize Google Sheets API');
    }
  }
  return sheets;
}

const SHEET_IDS = {
  buy: '1iyX-81lCSs6u9NFg4qu0g9GpJ1LBha1VKlQOJppLTs8',
  sell: '1Mp1i2RUzuAm5IYWyq5erKDTqhw9uBiqU3sK1KJc5Pi0',
  rent: '15XZrPHqFxUkA3cFNECV-jNO8y_CZTPpM5wCWgAzw1yg'
} as const;

type FormValue = string | string[] | number | boolean | null | undefined;

function preprocessValue(value: FormValue): string {
  if (Array.isArray(value)) {
    return value.map(v => String(v).trim()).join('; ');
  }
  if (typeof value === 'string') {
    return value.replace(/\$/g, '').replace(/,/g, ' ').trim();
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

type FormData = {
  userType: keyof typeof SHEET_IDS;
  name: string;
  email: string;
  phoneNumber: string;
  [key: string]: FormValue;
}

export async function POST(request: Request) {
  console.log('Received form submission request');

  try {
    const body = await request.json() as FormData;
    console.log('Received form data:', JSON.stringify(body, null, 2));

    console.log('Getting Sheets API...');
    const sheets = await getSheets();
    console.log('Sheets API obtained successfully');

    const { userType, name, email, phoneNumber, ...otherData } = body;

    if (!userType || !SHEET_IDS[userType]) {
      throw new Error('Invalid or missing user type');
    }

    const sheetId = SHEET_IDS[userType];

    const processedData = Object.entries(otherData).map(([key, value]) => {
      const processedValue = preprocessValue(value);
      console.log(`Processed ${key}:`, processedValue);
      return processedValue;
    });

    const values = [
      [
        new Date().toISOString(),
        preprocessValue(name),
        preprocessValue(email),
        preprocessValue(phoneNumber),
        ...processedData
      ],
    ];

    console.log(`Appending data to Google Sheet for ${userType}...`);
    console.log('Preprocessed values:', JSON.stringify(values, null, 2));

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'A2',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });

    console.log(`Data successfully appended to Google Sheet for ${userType}`);
    return NextResponse.json({ success: true, data: response.data });

  } catch (error: unknown) {
    console.error('Error in form submission:', error);

    let errorMessage = 'An unexpected error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    console.error('Detailed error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

    return NextResponse.json(
      {
        success: false,
        error: 'Internal Server Error',
        message: errorMessage
      },
      { status: 500 }
    );
  }
}
