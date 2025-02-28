# Shinara React Native SDK

This SDK provides a simple interface for integrating [Shinara](https://shinara.io/) into your React Native application.

## Installation

You can install the SDK using npm or yarn:

```bash
npm i shinara-react-native-sdk
```

or

```bash
yarn add shinara-react-native-sdk
```

## Usage

### Import Library

```jsx
import ShinaraSDK from 'shinara-react-native-sdk';
```

### Initialize Client
Initializes Shinara SDK and monitors In App Purchases to Attribute Conversion

```jsx
await ShinaraSDK.initialize('API_KEY');
```

### Validate Referral Code
Validates Affiliate's Referral Code
Note: Call `validateReferralCode` before In App Purchase for successful Attribution linking of Purchase and Affiliate

```jsx
await ShinaraSDK.validateReferralCode({code: 'Code'});
```

### Attribute Purchase
To attribute a purchase. Recommended to call this after successful in app purchase. Shinara will handle logic to only attribute purchase coming from a referral code

```jsx
ShinaraSDK.attributePurchase('in-app-purchase-product', 'in-app-purchase-transaction-id')
```

### Register a user (Optional)
By default, Shinara creates a new random userId and assign it to a conversion. Use `registerUser` if you want to use your own internal user id.

```jsx
ShinaraSDK.registerUser({userId: 'internal_user_id', name: '', email: '', phone: ''})
```
