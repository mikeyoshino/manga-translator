import { Disclosure } from "@headlessui/react";
import React from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router";

type Props = {};

export const Header: React.FC<Props> = () => {
  const { user, tokenBalance, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <Disclosure as="nav" className="bg-white shadow">
      <div className="mx-auto max-w-7xl px-2 sm:px-6 lg:px-8">
        <div className="relative flex h-16 justify-between">
          <div className="flex flex-1 items-center justify-center sm:items-stretch sm:justify-start">
            <div className="flex shrink-0 items-center text-teal-500">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="h-8 w-auto text-teal-500"
              >
                <path d="M11.25 4.533A9.707 9.707 0 0 0 6 3a9.735 9.735 0 0 0-3.25.555.75.75 0 0 0-.5.707v14.25a.75.75 0 0 0 1 .707A8.237 8.237 0 0 1 6 18.75c1.995 0 3.823.707 5.25 1.886V4.533ZM12.75 20.636A8.214 8.214 0 0 1 18 18.75c.966 0 1.89.166 2.75.47a.75.75 0 0 0 1-.708V4.262a.75.75 0 0 0-.5-.707A9.735 9.735 0 0 0 18 3a9.707 9.707 0 0 0-5.25 1.533v16.103Z" />
              </svg>
            </div>
            <div className="sm:ml-6 sm:flex sm:space-x-8">
              <a
                href="/studio"
                className="inline-flex items-center px-1 pt-1 font-medium text-gray-900"
              >
                Manga Translator
              </a>
            </div>
          </div>

          {/* Right side: token balance + user menu */}
          {user && (
            <div className="flex items-center space-x-4">
              {isAdmin ? (
                <span className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-full text-sm font-medium">
                  Admin (Unlimited)
                </span>
              ) : (
                <button
                  onClick={() => navigate("/studio/topup")}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-teal-50 text-teal-700 rounded-full hover:bg-teal-100 transition-colors text-sm font-medium"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.732 6.232a2.5 2.5 0 0 1 3.536 0 .75.75 0 1 0 1.06-1.06A4 4 0 0 0 6.5 8h-.25a.75.75 0 0 0 0 1.5H8.5a.5.5 0 0 1 0 1H6.75a.75.75 0 0 0 0 1.5h.25a4 4 0 0 0 6.828-2.828.75.75 0 1 0-1.06 1.06 2.5 2.5 0 0 1-3.536 0 .75.75 0 0 0-.494-.232H8.5a2 2 0 0 1 0-4h.232Z" clipRule="evenodd" />
                  </svg>
                  <span>{tokenBalance} tokens</span>
                </button>
              )}

              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500 hidden sm:inline">
                  {user.email}
                </span>
                <button
                  onClick={handleSignOut}
                  className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Disclosure>
  );
};
