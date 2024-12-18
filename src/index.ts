import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initConnection, Purchase, purchaseUpdatedListener } from 'react-native-iap';
import { API_HEADER_KEY, BASE_URL, SDK_REFERRAL_CODE_KEY, SDK_USER_EXTERNAL_USER_ID } from './constants';

// Response Types
export interface ValidateReferralCodeRequest {
  code: string;
}

export interface ValidateReferralCodeResponse {
  programId: string | undefined;
}

export interface RegisterUserRequest {
  userId: string;
  email?: string;
  name?: string;
  phone?: string;
}

class ShinaraSDK {
  private static instance: ShinaraSDK;
  private headers: HeadersInit;

  private constructor() {
    this.headers = {
      'Content-Type': 'application/json'
    };
  }

  public static getInstance(): ShinaraSDK {
    if (!ShinaraSDK.instance) {
      ShinaraSDK.instance = new ShinaraSDK();
    }
    return ShinaraSDK.instance;
  }

  public async initialize(apiKey: string): Promise<void> {
    if (Platform.OS !== 'ios') {
      throw new Error('ShinaraSDK is currently only supported on iOS platforms.');
    }

    this.headers = {
      ...this.headers,
      [API_HEADER_KEY]: apiKey,
    };

    try {
      await this.validateAPIKey();
      await initConnection();
      await this.setupPurchaseListener();
    } catch (e) {
      console.error('Error initializing ShinaraSDK:', e);
      throw e;
    }
  }

  private async makeRequest(endpoint: string, method: string, body?: any): Promise<any> {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  private async validateAPIKey(): Promise<void> {
    try {
      const data = await this.makeRequest('/api/key/validate', 'GET');
      if (!data.app_id) {
        throw new Error('Invalid API key');
      }
    } catch (e) {
      console.error('Error verifying API key:', e);
      throw new Error('Failed to verify API key');
    }
  }

  public async validateReferralCode(request: ValidateReferralCodeRequest): Promise<ValidateReferralCodeResponse> {
    try {
      const data = await this.makeRequest('/api/code/validate', 'POST', {
        code: request.code,
        platform: ''
      });
      await AsyncStorage.setItem(SDK_REFERRAL_CODE_KEY, request.code);
      return {
        programId: data.campaign_id,
      };
    } catch (e) {
      console.error('Error validating referral code:', e);
      throw new Error('Failed to validate Referral Code');
    }
  }

  public async getReferralCode(): Promise<string | undefined> {
    try {
      const code = await AsyncStorage.getItem(SDK_REFERRAL_CODE_KEY);
      return code ?? undefined;
    } catch (e) {
      console.error('Error getting referral code:', e);
      throw new Error('Failed to get Referral Code');
    }
  }

  public async registerUser(request: RegisterUserRequest): Promise<void> {
    const referralCode = await AsyncStorage.getItem(SDK_REFERRAL_CODE_KEY);
    if (!referralCode) {
      console.log('No stored referral code. Skipping user registration.');
      throw new Error('No stored code found. Please save a code before registering a user.');
    }

    try {
      await this.makeRequest('/newuser', 'POST', {
        code: referralCode,
        platform: '',
        conversion_user: {
          external_user_id: request.userId,
          name: request.name,
          email: request.email,
          phone: request.phone,
        },
      });
      await AsyncStorage.setItem(SDK_USER_EXTERNAL_USER_ID, request.userId);
    } catch (e) {
      console.error('Error registering user:', e);
    }
  }

  private async setupPurchaseListener(): Promise<void> {
    purchaseUpdatedListener(async (purchase: Purchase) => {
      const referralCode = await AsyncStorage.getItem(SDK_REFERRAL_CODE_KEY);
      if (!referralCode) {
        console.log('No stored referral code. Skipping purchase event.');
        return;
      }

      const externalUserId = await AsyncStorage.getItem(SDK_USER_EXTERNAL_USER_ID);
      await this.handlePurchase(purchase, referralCode, externalUserId ?? undefined);
    });
  }

  private async handlePurchase(purchase: Purchase, referralCode: string, externalUserId?: string): Promise<void> {
    try {
      await this.sendPurchaseEvent(purchase, referralCode, externalUserId);
    } catch (e) {
      console.error('Error handling purchase:', e);
    }
  }

  private async sendPurchaseEvent(purchase: Purchase, referralCode: string, externalUserId?: string): Promise<void> {
    try {
      const requestBody: any = {
        product_id: purchase.productId,
        transaction_id: purchase.transactionId,
        code: referralCode,
        platform: '',
      };

      if (externalUserId) {
        requestBody.external_user_id = externalUserId;
      }

      await this.makeRequest('/iappurchase', 'POST', requestBody);
    } catch (e) {
      console.error('Error sending purchase event:', e);
    }
  }
}

export default ShinaraSDK.getInstance();
