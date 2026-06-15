type IconProps = {
  color: string;
  bg: string;
};

export function GiftIcon({ color, bg }: IconProps) {
  return (
    <svg viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="26" cy="26" r="24" fill={bg} stroke={color} strokeWidth="1.5" />
      <rect x="14" y="24" width="24" height="14" rx="2" fill={color} opacity="0.16" />
      <rect x="14" y="24" width="24" height="14" rx="2" stroke={color} strokeWidth="1.6" />
      <rect x="12" y="19" width="28" height="6" rx="1.5" fill={color} />
      <rect x="23.5" y="19" width="5" height="19" fill={bg} />
      <path d="M26 19c-3-5-10-4-9 0 1 3 6 2 9 0z" fill={color} />
      <path d="M26 19c3-5 10-4 9 0-1 3-6 2-9 0z" fill={color} />
      <circle cx="26" cy="19" r="1.6" fill={color} />
      <path d="M40 13l1.3 2.7 2.7 1.3-2.7 1.3-1.3 2.7-1.3-2.7-2.7-1.3 2.7-1.3z" fill={color} />
    </svg>
  );
}

export function StopwatchIcon({ color, bg }: IconProps) {
  return (
    <svg viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="26" cy="26" r="24" fill={bg} stroke={color} strokeWidth="1.5" />
      <rect x="23" y="7" width="6" height="4" rx="1.5" fill={color} />
      <rect x="24.3" y="3" width="3.4" height="5" rx="1.2" fill={color} />
      <rect x="34.5" y="10.5" width="5" height="3" rx="1" fill={color} transform="rotate(35 37 12)" />
      <circle cx="26" cy="29" r="14" fill="#fff" stroke={color} strokeWidth="2" />
      <line x1="26" y1="17" x2="26" y2="19.5" stroke={color} strokeWidth="1.4" />
      <line x1="38" y1="29" x2="35.5" y2="29" stroke={color} strokeWidth="1.4" />
      <line x1="26" y1="41" x2="26" y2="38.5" stroke={color} strokeWidth="1.4" />
      <line x1="14" y1="29" x2="16.5" y2="29" stroke={color} strokeWidth="1.4" />
      <line x1="26" y1="29" x2="26" y2="21" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="26" y1="29" x2="31" y2="29" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="26" cy="29" r="1.6" fill={color} />
      <path d="M8 23c-1.4 2.2-1.4 5.6 0 7.8" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

export function AiCameraIcon({ color, bg }: IconProps) {
  return (
    <svg viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="26" cy="26" r="24" fill={bg} stroke={color} strokeWidth="1.5" />
      <rect x="11" y="20" width="26" height="18" rx="3" fill={color} opacity="0.16" />
      <rect x="11" y="20" width="26" height="18" rx="3" stroke={color} strokeWidth="1.8" />
      <rect x="17" y="15" width="10" height="6" rx="2" fill={color} />
      <circle cx="24" cy="29" r="6" fill="#fff" stroke={color} strokeWidth="1.8" />
      <circle cx="24" cy="29" r="2.4" fill={color} />
      <circle cx="33" cy="24" r="1.6" fill={color} />
      <path d="M41 12l1.7 3.6L46 17.3l-3.3 1.7L41 22.6l-1.7-3.6L36 17.3l3.3-1.7z" fill={color} />
      <path d="M10 10l1 2.2 2.2 1-2.2 1L10 16.4l-1-2.2L6.8 13.2l2.2-1z" fill={color} opacity="0.7" />
    </svg>
  );
}
