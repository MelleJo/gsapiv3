import React from 'react';
import { AlertTriangle } from 'lucide-react'; // Using an icon for attention

export default function PrivacyBanner() {
  return (
    <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 my-6 mx-auto max-w-5xl rounded-md shadow" role="alert">
      <div className="flex items-center">
        <div className="py-1">
          <AlertTriangle className="h-6 w-6 text-yellow-500 mr-3" />
        </div>
        <div>
          <p className="font-semibold">Let op: Dit is Super Kees ONLINE</p>
          <p className="text-sm">
            Hier mag je dus <strong>geen</strong> privacy-gevoelige informatie in uploaden.
            Gebruik bijvoorbeeld "klant" in plaats van Melle b.v. Heb je iets dat wel privacy-gevoelig is?
            Contacteer Melle, dan kijken we of het via onze eigen AI kan; Super Kees.
          </p>
        </div>
      </div>
    </div>
  );
}
