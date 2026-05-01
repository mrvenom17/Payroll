'use client';

import CompanyManager from '@/components/CompanyManager';

export default function CompaniesPage() {
  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">🏢 Company Management</h1>
          <p className="page-subtitle">Multi-tenancy controller — switch, edit, or remove operating entities.</p>
        </div>
      </div>
      <div className="card">
        <div className="card-body">
          <CompanyManager />
        </div>
      </div>
    </div>
  );
}
