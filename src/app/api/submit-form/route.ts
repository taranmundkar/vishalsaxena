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
};

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

export async function POST(req: Request) {
  console.log('Received form submission request');

  try {
    const body = await req.json() as FormData;
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
      return `${key}: ${processedValue}`;
    }).join(' | ');

    const values = [
      [new Date().toISOString(), name, email, phoneNumber, processedData]
    ];

    console.log('Appending data to sheet...');
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'A2:E', // Changed from 'A:E' to 'A2:E' to start from the second row
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS', // This ensures new data is inserted as new rows
      requestBody: {
        values: values
      }
    });
    console.log('Data appended successfully');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in form submission:', error);
    return NextResponse.json({ success: false, error: 'An error occurred while submitting the form' }, { status: 500 });
  }
}