import { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

// Set mínimo de íconos de línea para la navegación (sin librería externa —
// el stack de docs/02 no define una, y son solo 7 glifos).
function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 9.5L10 3l7 6.5" />
      <path d="M5 8.5V17h10V8.5" />
    </Icon>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="7.5" cy="7" r="2.5" />
      <path d="M2.5 17c.5-3 2.4-4.5 5-4.5s4.5 1.5 5 4.5" />
      <circle cx="14" cy="7.5" r="2" />
      <path d="M13 12.7c2.1.3 3.4 1.7 3.8 4.3" />
    </Icon>
  );
}

export function BotIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="7.5" width="12" height="9" rx="2.5" />
      <path d="M10 7.5V4.5" />
      <circle cx="10" cy="3.2" r="1" />
      <circle cx="7.5" cy="12" r="1" />
      <circle cx="12.5" cy="12" r="1" />
      <path d="M1.5 10v3M18.5 10v3" />
    </Icon>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 17V3" />
      <path d="M3 17h14" />
      <path d="M6.5 14v-4M10.5 14V6M14.5 14v-6.5" />
    </Icon>
  );
}

export function CreditCardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="5" width="15" height="10.5" rx="2" />
      <path d="M2.5 8.5h15" />
      <path d="M5.5 12.5h3" />
    </Icon>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 4.5h14a1 1 0 011 1V13a1 1 0 01-1 1H8l-3.5 3V14H3a1 1 0 01-1-1V5.5a1 1 0 011-1z" />
    </Icon>
  );
}

export function CalculatorIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4.5" y="2.5" width="11" height="15" rx="1.5" />
      <path d="M7 5.5h6" />
      <path d="M7 9.5h.01M10 9.5h.01M13 9.5h.01M7 12.5h.01M10 12.5h.01M13 12.5h.01M7 15.5h.01M10 15.5h.01M13 15.5h.01" strokeWidth={2} />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.1 4.9l-1.4 1.4M6.3 13.7l-1.4 1.4M15.1 15.1l-1.4-1.4M6.3 6.3L4.9 4.9" />
    </Icon>
  );
}
