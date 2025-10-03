const contacts = [
  { label: "Email", value: "contact@borkiss.trade", link: "mailto:contact@borkiss.trade" },
  { label: "Telegram", value: "@borkiss", link: "https://t.me/borkiss" },
  { label: "GitHub", value: "github.com/borkiss", link: "https://github.com/borkiss" },
  { label: "LinkedIn", value: "linkedin.com/in/borkiss", link: "https://linkedin.com/in/borkiss" },
];

export const Contact = () => {
  return (
    <section className="py-32 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          <div>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Let's Work<br />Together
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Available for freelance projects, consulting, and full-time opportunities.
            </p>
            <div className="w-20 h-1 bg-primary" />
          </div>
          
          <div className="space-y-6">
            {contacts.map((contact) => (
              <a
                key={contact.label}
                href={contact.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block border border-border bg-card p-6 hover-lift group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground mb-2">{contact.label}</div>
                    <div className="text-lg font-medium group-hover:text-primary transition-colors">
                      {contact.value}
                    </div>
                  </div>
                  <div className="w-8 h-8 border border-border flex items-center justify-center group-hover:border-primary group-hover:bg-primary/5 transition-all">
                    <span>→</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
