export const PRODUCT_CATEGORIES = [
  'Home sale',
  'Home rent',
  'Car rent',
  'Hair salon',
  'Production',
  'Transport',
  'Construction',
  'Market',
  'Service order',
  'E-book',
  'Digital file',
  'Software',
  'Online course',
  'Other digital product',
  'Other category',
]

export const getProductCategory = product =>
  String(product?.category || product?.productType || product?.type || 'Other category').trim() || 'Other category'
