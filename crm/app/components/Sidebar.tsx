import { NavLink } from "react-router";
import {
  HomeIcon,
  UsersIcon,
  CurrencyDollarIcon,
  CreditCardIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline";

const links = [
  { to: "/dashboard", label: "Dashboard", icon: HomeIcon },
  { to: "/users", label: "Users", icon: UsersIcon },
  { to: "/transactions", label: "Transactions", icon: CurrencyDollarIcon },
  { to: "/payments", label: "Payments", icon: CreditCardIcon },
  { to: "/activity", label: "Activity", icon: ChartBarIcon },
];

export default function Sidebar() {
  return (
    <nav className="flex w-56 flex-col border-r border-slate-700 bg-slate-800">
      <div className="flex h-14 items-center px-4">
        <span className="text-xl font-bold text-indigo-400">CRM</span>
      </div>
      <ul className="flex-1 space-y-1 px-2 py-2">
        {links.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "text-slate-300 hover:bg-slate-700 hover:text-white"
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
