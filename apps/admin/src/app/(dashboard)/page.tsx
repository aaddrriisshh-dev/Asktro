'use client';

import { RevenueCard } from '@/components/RevenueCard';
import { RegisteredUsersCard } from '@/components/RegisteredUsersCard';
import { ActiveConsultationsCard } from '@/components/ActiveConsultationsCard';
import { ConversionCard } from '@/components/ConversionCard';
import { ActiveAstrologersCard, TotalAstrologersCard } from '@/components/AstrologersCards';
import { PaidUsersCard, UnpaidUsersCard } from '@/components/PaidUnpaidCards';
import { SupportTicketsCard } from '@/components/SupportTicketsCard';
import { PayoutCard } from '@/components/PayoutCard';
import { TestRecharge } from '@/components/TestRecharge';
import { OperationsSection } from '@/components/OperationsSection';
import { UsersActivityTable } from '@/components/UsersActivityTable';
import { PanelProvider } from '@/lib/panels';

export default function DashboardPage() {

  return (
    <PanelProvider>
    <div>
      <div className="hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="hero__logo" src="/brand/asktro_logo.png" alt="Asktro" />
        <div className="hero__text">
          <h1 className="hero__greeting">Welcome back</h1>
          <p className="hero__sub">
            Your celestial marketplace at a glance — astrologers, consultations and wallets, in real time.
          </p>
        </div>
      </div>

      <div className="grid dashgrid">
        <RevenueCard />
        <RegisteredUsersCard />
        <ActiveConsultationsCard />
        <ConversionCard />
        <ActiveAstrologersCard />
        <TotalAstrologersCard />
        <PaidUsersCard />
        <UnpaidUsersCard />
        <SupportTicketsCard />
        <PayoutCard />
      </div>

      <OperationsSection />

      <TestRecharge />

      <UsersActivityTable />
    </div>
    </PanelProvider>
  );
}
