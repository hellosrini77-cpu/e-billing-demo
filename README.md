# Legal Ops E-Billing System

A prototype demonstrating legal operations e-billing concepts including:

- **Matter Budget Management** - Track annual budgets with real-time spend visibility
- **Invoice Processing** - Upload PDF invoices or manual entry with approval workflow
- **Accruals** - Manage unbilled work-in-progress estimates
- **Accounts Payable Pipeline** - Pending → Approved → Paid workflow
- **Budget Commitment Tracking** - Visual breakdown of Paid + A/P + Accruals

## Features

- PDF invoice parsing (extracts vendor, date, amount)
- 3-stage invoice approval workflow
- Accrual management for month-end close
- Persistent data storage (localStorage)
- Responsive design

## Tech Stack

- React 18
- Vite
- Tailwind CSS
- PDF.js for document parsing

## Local Development

```bash
npm install
npm run dev
```

## Deployment

This project is configured for Vercel deployment. Connect your GitHub repo to Vercel for automatic deploys.

## Demo

Built as an interview demonstration of legal operations and e-billing system concepts.
