import { Link } from "wouter";
import { Mail, MapPin, Phone, Globe } from "lucide-react";
import logoUrl from "@assets/Inter_freight_logo_nobg.png";

export function Footer() {
  return (
    <footer className="bg-secondary text-secondary-foreground pt-16 pb-8 border-t-[6px] border-primary">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">

          <div className="space-y-4">
            <Link href="/" className="inline-block">
              <img src={logoUrl} alt="InterFreight Logo" className="h-16 w-auto mb-4" />
            </Link>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Moving Africa Forward. Premium logistics, freight forwarding, and customs clearance services across Southern and East Africa.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-6 tracking-tight text-white uppercase">Quick Links</h3>
            <ul className="space-y-3">
              <li><Link href="/" className="text-muted-foreground hover:text-primary transition-colors text-sm">Home</Link></li>
              <li><a href="/#services" className="text-muted-foreground hover:text-primary transition-colors text-sm">Our Services</a></li>
              <li><a href="/#contact" className="text-muted-foreground hover:text-primary transition-colors text-sm">Contact Us</a></li>
              <li><Link href="/auth" className="text-muted-foreground hover:text-primary transition-colors text-sm">Client Portal</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-6 tracking-tight text-white uppercase">Our Services</h3>
            <ul className="space-y-3">
              <li className="text-muted-foreground text-sm">Road Freight</li>
              <li className="text-muted-foreground text-sm">Ocean Freight</li>
              <li className="text-muted-foreground text-sm">Air Freight</li>
              <li className="text-muted-foreground text-sm">Rail Freight</li>
              <li className="text-muted-foreground text-sm">Customs Clearance</li>
              <li className="text-muted-foreground text-sm">Warehousing</li>
            </ul>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-6 tracking-tight text-white uppercase">Contact Us</h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3 text-muted-foreground text-sm">
                <MapPin className="text-primary shrink-0 mt-0.5" size={18} />
                <span>Blantyre, Malawi<br />Head Office</span>
              </li>
              <li className="flex items-start gap-3 text-muted-foreground text-sm">
                <Phone className="text-primary shrink-0 mt-0.5" size={18} />
                <span>+265 997 991 991<br />+265 888 991 991</span>
              </li>
              <li className="flex items-center gap-3 text-muted-foreground text-sm">
                <Mail className="text-primary shrink-0" size={18} />
                <span>info@interfreightsolutions.com</span>
              </li>
              <li className="flex items-center gap-3 text-muted-foreground text-sm">
                <Globe className="text-primary shrink-0" size={18} />
                <span>www.interfreightsolutions.com</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-border/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} InterFreight Solutions. All rights reserved.
          </p>
          <div className="flex gap-4">
            <span className="text-xs text-muted-foreground hover:text-white cursor-pointer">Privacy Policy</span>
            <span className="text-xs text-muted-foreground hover:text-white cursor-pointer">Terms of Service</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
