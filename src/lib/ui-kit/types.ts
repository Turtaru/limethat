export type LabelOption = { id: string; name: string };
export type DockAction = {
  label: string;
  icon?: 'create' | 'edit' | 'save' | 'reset' | 'folder';
  disabled?: boolean;
  type?: 'button' | 'submit';
  form?: string;
  onclick?: (event: MouseEvent) => void;
};

export type EditorPicture = { id: string; name: string };
export type LabelEditorDraft = { name: string; picture: File | null; removePicture: boolean };
export type EventDraft = {
  title: string;
  date: string;
  endDate: string;
  description: string;
  labelIds: string[];
  pictures: File[];
  removedPictureIds: string[];
};
