export const getApiErrorMessage = (error, fallback = 'Something went wrong') => {
  if (Number(error?.response?.status) === 413) {
    return 'Upload is too large for hosted server limits. Use a smaller CSV or load the demo dataset.';
  }

  if (!error?.response) {
    return 'Connection error — check your server';
  }

  const message = String(error.response?.data?.error || '').trim();
  if (!message) return fallback;

  if (/unclear|parse|Unexpected token|JSON/i.test(message)) {
    return 'AI response was unclear, please rephrase';
  }

  if (/no data matches/i.test(message)) {
    return 'No data matches your current filters';
  }

  return message;
};
