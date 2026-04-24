/**
 * أكواد الاستجابة من بوابة ميسر
 * يحول الأكواد إلى رسائل مفهومة باللغة العربية
 */

interface ResponseCode {
  code: string
  reason: string
  status: 'paid' | 'failed'
  explanation: string
  userMessage: string
  userAction: string
}

export const MOYASAR_RESPONSE_CODES: Record<string, ResponseCode> = {
  '00': {
    code: '00',
    reason: 'Transaction Approved',
    status: 'paid',
    explanation: 'The transaction was successful.',
    userMessage: '✅ تم الدفع بنجاح',
    userAction: 'تم اكتمال العملية بنجاح'
  },
  '01': {
    code: '01',
    reason: 'Refer to Issuer',
    status: 'failed',
    explanation: 'The card\'s bank found an issue. Contact the bank or try another card.',
    userMessage: '❌ مشكلة في البطاقة',
    userAction: 'تواصل مع البنك المصدر للبطاقة أو جرب بطاقة أخرى'
  },
  '02': {
    code: '02',
    reason: 'Refer to Issuer, special',
    status: 'failed',
    explanation: 'The card\'s bank found an issue. Contact the bank or try another card.',
    userMessage: '❌ مشكلة خاصة في البطاقة',
    userAction: 'تواصل مع البنك المصدر للبطاقة أو جرب بطاقة أخرى'
  },
  '03': {
    code: '03',
    reason: 'No Merchant',
    status: 'failed',
    explanation: 'The merchant ID is invalid. Contact your bank with the correct merchant account number.',
    userMessage: '❌ مشكلة في النظام',
    userAction: 'يرجى المحاولة لاحقاً أو التواصل معنا'
  },
  '04': {
    code: '04',
    reason: 'Pick Up Card',
    status: 'failed',
    explanation: 'The bank declined the transaction and wants the card to be kept due to it being reported lost or stolen.',
    userMessage: '❌ البطاقة مُبلغ عنها',
    userAction: 'استخدم بطاقة أخرى - البطاقة مُبلغ عنها كمفقودة أو مسروقة'
  },
  '05': {
    code: '05',
    reason: 'Do Not Honour',
    status: 'failed',
    explanation: 'The bank declined the transaction due to a security issue or lack of funds.',
    userMessage: '❌ رفض البنك المعاملة',
    userAction: 'تحقق من الرصيد أو استخدم بطاقة أخرى'
  },
  '06': {
    code: '06',
    reason: 'Error',
    status: 'failed',
    explanation: 'The card\'s bank declined the transaction due to a card number error.',
    userMessage: '❌ خطأ في رقم البطاقة',
    userAction: 'تحقق من رقم البطاقة أو استخدم بطاقة أخرى'
  },
  '07': {
    code: '07',
    reason: 'Pick Up Card, Special',
    status: 'failed',
    explanation: 'The bank declined the transaction and wants the card to be kept due to it being reported lost or stolen.',
    userMessage: '❌ البطاقة مُبلغ عنها (خاص)',
    userAction: 'استخدم بطاقة أخرى - البطاقة مُبلغ عنها كمفقودة أو مسروقة'
  },
  '08': {
    code: '08',
    reason: 'Honor With Identification',
    status: 'paid',
    explanation: 'The transaction was successful. This code is sometimes used instead of \'00\'.',
    userMessage: '✅ تم الدفع بنجاح (مع التحقق)',
    userAction: 'تم اكتمال العملية بنجاح'
  },
  '09': {
    code: '09',
    reason: 'Request In Progress',
    status: 'failed',
    explanation: 'The card\'s bank found an issue. Contact the bank or try another card.',
    userMessage: '❌ الطلب قيد المعالجة',
    userAction: 'تواصل مع البنك أو جرب بطاقة أخرى'
  },
  '10': {
    code: '10',
    reason: 'Approved For Partial Amount',
    status: 'paid',
    explanation: 'The transaction was successful.',
    userMessage: '✅ تم الدفع بنجاح (جزئي)',
    userAction: 'تم اكتمال العملية بنجاح'
  },
  '11': {
    code: '11',
    reason: 'Approved, VIP',
    status: 'paid',
    explanation: 'The transaction was successful. (Not used in Australia.)',
    userMessage: '✅ تم الدفع بنجاح (VIP)',
    userAction: 'تم اكتمال العملية بنجاح'
  },
  '12': {
    code: '12',
    reason: 'Invalid Transaction',
    status: 'failed',
    explanation: 'The bank declined the transaction due to incorrect information.',
    userMessage: '❌ معاملة غير صحيحة',
    userAction: 'تحقق من البيانات وأعد المحاولة'
  },
  '13': {
    code: '13',
    reason: 'Invalid Amount',
    status: 'failed',
    explanation: 'There\'s an error with the amount entry. Check your website\'s code.',
    userMessage: '❌ مبلغ غير صحيح',
    userAction: 'يرجى المحاولة لاحقاً أو التواصل معنا'
  },
  '14': {
    code: '14',
    reason: 'Invalid Card Number',
    status: 'failed',
    explanation: 'The bank declined the transaction because the card number does not exist.',
    userMessage: '❌ رقم بطاقة غير صحيح',
    userAction: 'تحقق من رقم البطاقة وأعد المحاولة'
  },
  '15': {
    code: '15',
    reason: 'No Issuer',
    status: 'failed',
    explanation: 'The card\'s bank does not exist. Check the details and retry.',
    userMessage: '❌ البنك المصدر غير موجود',
    userAction: 'تحقق من بيانات البطاقة وأعد المحاولة'
  },
  '16': {
    code: '16',
    reason: 'Approved, Update Track 3',
    status: 'paid',
    explanation: 'The transaction was successful.',
    userMessage: '✅ تم الدفع بنجاح',
    userAction: 'تم اكتمال العملية بنجاح'
  },
  '19': {
    code: '19',
    reason: 'Re-enter Last Transaction',
    status: 'failed',
    explanation: 'The transaction was not processed. Try processing again.',
    userMessage: '❌ لم تتم المعالجة',
    userAction: 'أعد إدخال بيانات المعاملة'
  },
  '21': {
    code: '21',
    reason: 'No Action Taken',
    status: 'failed',
    explanation: 'The card\'s bank found an issue. Contact the bank or try another card.',
    userMessage: '❌ لم يتم اتخاذ إجراء',
    userAction: 'تواصل مع البنك أو جرب بطاقة أخرى'
  },
  '22': {
    code: '22',
    reason: 'Suspected Malfunction',
    status: 'failed',
    explanation: 'The bank could not be contacted during the transaction.',
    userMessage: '❌ مشكلة في الاتصال',
    userAction: 'تحقق من البيانات وأعد المحاولة'
  },
  '23': {
    code: '23',
    reason: 'Unacceptable Transaction Fee',
    status: 'failed',
    explanation: 'An unspecified error occurred.',
    userMessage: '❌ رسوم معاملة غير مقبولة',
    userAction: 'حدث خطأ غير محدد، يرجى المحاولة لاحقاً'
  },
  '25': {
    code: '25',
    reason: 'Unable to Locate Record On File',
    status: 'failed',
    explanation: 'The bank does not recognize the card details.',
    userMessage: '❌ لا يمكن العثور على بيانات البطاقة',
    userAction: 'تحقق من بيانات البطاقة وأعد المحاولة'
  },
  '30': {
    code: '30',
    reason: 'Format Error',
    status: 'failed',
    explanation: 'The bank does not recognize the transaction details.',
    userMessage: '❌ خطأ في التنسيق',
    userAction: 'تحقق من البيانات وأعد المحاولة'
  },
  '31': {
    code: '31',
    reason: 'Bank Not Supported By Switch',
    status: 'failed',
    explanation: 'The bank declined the transaction for mail/telephone, fax, email, or internet orders.',
    userMessage: '❌ البنك لا يدعم الدفع الإلكتروني',
    userAction: 'استخدم بطاقة أخرى'
  },
  '33': {
    code: '33',
    reason: 'Expired Card, Capture',
    status: 'failed',
    explanation: 'The bank declined the transaction because the card has expired.',
    userMessage: '❌ البطاقة منتهية الصلاحية',
    userAction: 'تحقق من تاريخ انتهاء البطاقة أو استخدم بطاقة أخرى'
  },
  '34': {
    code: '34',
    reason: 'Suspected Fraud, Retain Card',
    status: 'failed',
    explanation: 'The bank suspects fraud on this card.',
    userMessage: '❌ اشتباه في احتيال',
    userAction: 'تواصل مع البنك المصدر للبطاقة'
  },
  '35': {
    code: '35',
    reason: 'Card Acceptor, Contact Acquirer, Retain Card',
    status: 'failed',
    explanation: 'The bank declined the transaction and wants the card to be kept.',
    userMessage: '❌ البطاقة مُبلغ عنها',
    userAction: 'استخدم بطاقة أخرى'
  },
  '36': {
    code: '36',
    reason: 'Restricted Card, Retain Card',
    status: 'failed',
    explanation: 'The bank declined the transaction and wants the card to be kept.',
    userMessage: '❌ بطاقة محظورة',
    userAction: 'استخدم بطاقة أخرى'
  },
  '37': {
    code: '37',
    reason: 'Contact Acquirer Security Department, Retain Card',
    status: 'failed',
    explanation: 'The bank declined the transaction and wants the card to be kept.',
    userMessage: '❌ تواصل مع قسم الأمان',
    userAction: 'استخدم بطاقة أخرى وتواصل مع البنك'
  },
  '38': {
    code: '38',
    reason: 'PIN Tries Exceeded, Capture',
    status: 'failed',
    explanation: 'The bank declined the transaction due to wrong PIN entered three times.',
    userMessage: '❌ تم تجاوز محاولات الرقم السري',
    userAction: 'استخدم بطاقة أخرى وتواصل مع البنك'
  },
  '39': {
    code: '39',
    reason: 'No Credit Account',
    status: 'failed',
    explanation: 'The bank declined the transaction as the card is not linked to a credit account.',
    userMessage: '❌ لا يوجد حساب ائتماني',
    userAction: 'استخدم بطاقة أخرى'
  },
  '40': {
    code: '40',
    reason: 'Function Not Supported',
    status: 'failed',
    explanation: 'The bank declined the transaction as it doesn\'t allow this type of transaction.',
    userMessage: '❌ نوع المعاملة غير مدعوم',
    userAction: 'استخدم بطاقة أخرى'
  },
  '41': {
    code: '41',
    reason: 'Lost Card',
    status: 'failed',
    explanation: 'The bank declined the transaction because the card was reported lost.',
    userMessage: '❌ البطاقة مُبلغ عنها كمفقودة',
    userAction: 'استخدم بطاقة أخرى'
  },
  '42': {
    code: '42',
    reason: 'No Universal Account',
    status: 'failed',
    explanation: 'The bank declined the transaction as the account type selected is not valid.',
    userMessage: '❌ نوع الحساب غير صالح',
    userAction: 'استخدم بطاقة أخرى'
  },
  '43': {
    code: '43',
    reason: 'Stolen Card',
    status: 'failed',
    explanation: 'The bank declined the transaction because the card was reported stolen.',
    userMessage: '❌ البطاقة مُبلغ عنها كمسروقة',
    userAction: 'استخدم بطاقة أخرى'
  },
  '44': {
    code: '44',
    reason: 'No Investment Account',
    status: 'failed',
    explanation: 'The bank declined the transaction as the account type selected is not valid.',
    userMessage: '❌ لا يوجد حساب استثماري',
    userAction: 'استخدم بطاقة أخرى'
  },
  '51': {
    code: '51',
    reason: 'Insufficient Funds',
    status: 'failed',
    explanation: 'The bank declined the transaction due to insufficient funds.',
    userMessage: '❌ رصيد غير كافٍ',
    userAction: 'تأكد من وجود رصيد كافٍ في حسابك أو استخدم بطاقة أخرى'
  },
  '52': {
    code: '52',
    reason: 'No Cheque Account',
    status: 'failed',
    explanation: 'The bank declined the transaction as the linked cheque account does not exist.',
    userMessage: '❌ لا يوجد حساب جاري',
    userAction: 'استخدم بطاقة أخرى'
  },
  '53': {
    code: '53',
    reason: 'No Savings Account',
    status: 'failed',
    explanation: 'The bank declined the transaction as the linked savings account does not exist.',
    userMessage: '❌ لا يوجد حساب توفير',
    userAction: 'استخدم بطاقة أخرى'
  },
  '54': {
    code: '54',
    reason: 'Expired Card',
    status: 'failed',
    explanation: 'The bank declined the transaction because the card has expired.',
    userMessage: '❌ البطاقة منتهية الصلاحية',
    userAction: 'تحقق من تاريخ انتهاء البطاقة أو استخدم بطاقة أخرى'
  },
  '55': {
    code: '55',
    reason: 'Incorrect PIN',
    status: 'failed',
    explanation: 'The bank declined the transaction due to an incorrect PIN.',
    userMessage: '❌ رقم سري خاطئ',
    userAction: 'أعد إدخال الرقم السري الصحيح أو استخدم بطاقة أخرى'
  },
  '56': {
    code: '56',
    reason: 'No Card Record',
    status: 'failed',
    explanation: 'The bank declined the transaction because the card number does not exist.',
    userMessage: '❌ البطاقة غير مسجلة',
    userAction: 'استخدم بطاقة أخرى'
  },
  '57': {
    code: '57',
    reason: 'Function Not Permitted to Cardholder',
    status: 'failed',
    explanation: 'The bank declined the transaction because this card can\'t be used for this transaction.',
    userMessage: '❌ المعاملة غير مسموحة لحامل البطاقة',
    userAction: 'استخدم بطاقة أخرى'
  },
  '59': {
    code: '59',
    reason: 'Suspected Fraud',
    status: 'failed',
    explanation: 'The bank declined this transaction due to suspected fraud.',
    userMessage: '❌ اشتباه في احتيال',
    userAction: 'تواصل مع البنك المصدر للبطاقة'
  },
  '60': {
    code: '60',
    reason: 'Acceptor Contact Acquirer',
    status: 'failed',
    explanation: 'The bank declined the transaction. Contact your bank and try again.',
    userMessage: '❌ تواصل مع البنك',
    userAction: 'تواصل مع البنك وأعد المحاولة'
  },
  '61': {
    code: '61',
    reason: 'Exceeds Withdrawal Limit',
    status: 'failed',
    explanation: 'The bank declined the transaction as it exceeds the card\'s limit.',
    userMessage: '❌ تجاوز حد السحب',
    userAction: 'استخدم بطاقة أخرى أو اخفض المبلغ'
  },
  '62': {
    code: '62',
    reason: 'Restricted Card',
    status: 'failed',
    explanation: 'The bank declined the transaction due to restrictions on the card.',
    userMessage: '❌ بطاقة محظورة',
    userAction: 'استخدم بطاقة أخرى'
  },
  '63': {
    code: '63',
    reason: 'Security Violation',
    status: 'failed',
    explanation: 'The bank declined the transaction.',
    userMessage: '❌ انتهاك أمني',
    userAction: 'استخدم بطاقة أخرى'
  },
  '64': {
    code: '64',
    reason: 'Original Amount Incorrect',
    status: 'failed',
    explanation: 'The bank declined the transaction due to a wrong amount being processed.',
    userMessage: '❌ المبلغ الأصلي خاطئ',
    userAction: 'تحقق من المبلغ وأعد المحاولة'
  },
  '65': {
    code: '65',
    reason: 'Exceeds withdrawal',
    status: 'failed',
    explanation: 'The bank declined the transaction as the withdrawal limit was exceeded.',
    userMessage: '❌ تجاوز حد السحب',
    userAction: 'استخدم بطاقة أخرى أو اخفض المبلغ'
  },
  '66': {
    code: '66',
    reason: 'Acceptor Contact Acquirer, Security',
    status: 'failed',
    explanation: 'The bank declined the transaction and asks the merchant to contact the bank.',
    userMessage: '❌ تواصل مع البنك (أمان)',
    userAction: 'استخدم بطاقة أخرى'
  },
  '67': {
    code: '67',
    reason: 'Capture Card',
    status: 'failed',
    explanation: 'The bank declined the transaction as the card is suspected counterfeit.',
    userMessage: '❌ بطاقة مشبوهة',
    userAction: 'استخدم بطاقة أخرى'
  },
  '75': {
    code: '75',
    reason: 'PIN Tries Exceeded',
    status: 'failed',
    explanation: 'The bank declined the transaction because the wrong PIN was entered too many times.',
    userMessage: '❌ تجاوز محاولات الرقم السري',
    userAction: 'استخدم بطاقة أخرى'
  },
  '79': {
    code: '79',
    reason: 'Life cycle (Mastercard use only)',
    status: 'failed',
    explanation: 'The transaction is refused due to invalid card data.',
    userMessage: '❌ بيانات بطاقة غير صالحة',
    userAction: 'استخدم بطاقة أخرى'
  },
  '82': {
    code: '82',
    reason: 'CVV Validation Error',
    status: 'failed',
    explanation: 'The bank declined the transaction because of an incorrect CVV.',
    userMessage: '❌ رقم CVV خاطئ',
    userAction: 'تحقق من رقم CVV الموجود على ظهر البطاقة وأعد المحاولة'
  },
  '90': {
    code: '90',
    reason: 'Cutoff In Progress',
    status: 'failed',
    explanation: 'The bank is temporarily unable to process the card.',
    userMessage: '❌ البنك غير متاح مؤقتاً',
    userAction: 'أعد المحاولة لاحقاً'
  },
  '91': {
    code: '91',
    reason: 'Card Issuer Unavailable',
    status: 'failed',
    explanation: 'The bank could not be contacted to authorise the transaction.',
    userMessage: '❌ البنك المصدر غير متاح',
    userAction: 'أعد المحاولة لاحقاً'
  },
  '92': {
    code: '92',
    reason: 'Unable To Route Transaction',
    status: 'failed',
    explanation: 'The bank could not be found for routing.',
    userMessage: '❌ لا يمكن توجيه المعاملة',
    userAction: 'أعد المحاولة'
  },
  '93': {
    code: '93',
    reason: 'Cannot Complete, Violation Of The Law',
    status: 'failed',
    explanation: 'The bank declined the transaction and requests the customer to contact their bank.',
    userMessage: '❌ انتهاك قانوني',
    userAction: 'تواصل مع البنك المصدر للبطاقة'
  },
  '94': {
    code: '94',
    reason: 'Duplicate Transaction',
    status: 'failed',
    explanation: 'The bank declined the transaction as it seems to be a duplicate.',
    userMessage: '❌ معاملة مكررة',
    userAction: 'لا حاجة لإجراء آخر - المعاملة مكررة'
  },
  '96': {
    code: '96',
    reason: 'System Error',
    status: 'failed',
    explanation: 'The bank could not process the transaction.',
    userMessage: '❌ خطأ في النظام',
    userAction: 'أعد المحاولة لاحقاً'
  }
}

/**
 * الحصول على تفاصيل كود الاستجابة
 */
export function getResponseCodeInfo(code: string): ResponseCode | null {
  return MOYASAR_RESPONSE_CODES[code] || null
}

/**
 * إنشاء رسالة خطأ مفهومة للمستخدم
 */
export function formatPaymentError(responseCode?: string, fallbackMessage?: string): {
  message: string
  action: string
  isRetryable: boolean
} {
  if (!responseCode) {
    return {
      message: fallbackMessage || '❌ حدث خطأ في الدفع',
      action: 'يرجى المحاولة لاحقاً أو استخدام طريقة دفع أخرى',
      isRetryable: true
    }
  }

  const codeInfo = getResponseCodeInfo(responseCode)
  if (!codeInfo) {
    return {
      message: `❌ خطأ غير معروف (${responseCode})`,
      action: 'يرجى المحاولة لاحقاً أو التواصل معنا',
      isRetryable: true
    }
  }

  // تحديد إمكانية إعادة المحاولة
  const nonRetryableCodes = ['04', '07', '34', '35', '36', '37', '38', '41', '43', '67', '75', '94']
  const isRetryable = !nonRetryableCodes.includes(responseCode)

  return {
    message: codeInfo.userMessage,
    action: codeInfo.userAction,
    isRetryable
  }
}