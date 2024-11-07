export const cleanDialog = (dialog: string) => {
  // Clear any lines that start with %%%
  dialog = dialog.replace(/%%%\s*.*\n/g, "");
  return dialog;
};
