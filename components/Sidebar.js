'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navSections = [
  {
    title: null,
    links: [
      { href: '/', label: 'Dashboard', icon: '📊' },
      { href: '/employees', label: 'Employees', icon: '👥' },
      { href: '/salary', label: 'Salaries', icon: '💰' },
    ],
  },
  {
    title: 'Masters',
    links: [
      { href: '/masters/departments', label: 'Departments', icon: '🏢' },
      { href: '/masters/designations', label: 'Designations', icon: '📋' },
      { href: '/masters/salary-components', label: 'Salary Components', icon: '⚙️' },
    ],
  },
  {
    title: 'Payroll',
    links: [
      { href: '/attendance', label: 'Attendance', icon: '📅' },
      { href: '/payroll', label: 'Run Payroll', icon: '🔄' },
      { href: '/payslip', label: 'Payslips', icon: '🧾' },
      { href: '/loans', label: 'Loans & Advances', icon: '🏦' },
    ],
  },
  {
    title: 'Reports',
    links: [
      { href: '/reports/salary-register', label: 'Salary Register', icon: '📑' },
      { href: '/reports/attendance', label: 'Attendance Report', icon: '📋' },
      { href: '/reports/pf-esic', label: 'PF / ESIC Report', icon: '🏛️' },
    ],
  },
  {
    title: 'Compliance',
    links: [
      { href: '/compliance/tax', label: 'Tax Calculator', icon: '🧮' },
      { href: '/compliance/minimum-wage', label: 'Min Wage Check', icon: '✅' },
    ],
  },
  {
    title: 'Settlement',
    links: [
      { href: '/fnf', label: 'FNF Settlement', icon: '📝' },
    ],
  },
  {
    title: 'System',
    links: [
      { href: '/audit', label: 'Audit Logs', icon: '📋' },
      { href: '/settings', label: 'Settings', icon: '⚙️' },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  const isActive = (href) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <aside className="sidebar" id="main-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-logo">P</div>
        <div className="sidebar-brand-text">
          <span className="sidebar-brand-name">PAYROLL</span>
          <span className="sidebar-brand-sub">Management System</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navSections.map((section, si) => (
          <div className="sidebar-section" key={si}>
            {section.title && (
              <div className="sidebar-section-title">{section.title}</div>
            )}
            {section.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`sidebar-link ${isActive(link.href) ? 'active' : ''}`}
              >
                <span className="sidebar-link-icon">{link.icon}</span>
                <span>{link.label}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
