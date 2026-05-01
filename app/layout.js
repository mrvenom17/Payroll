import './globals.css';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import Providers from '@/components/Providers';

export const metadata = {
  title: 'Payroll Management System',
  description: 'Comprehensive India-compliant payroll management system — PF, ESIC, TDS, Professional Tax, FNF Settlement, Multi-tenancy',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="app-layout">
            <Sidebar />
            <main className="main-content">
              <Topbar />
              <div className="page-content">
                {children}
              </div>
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
