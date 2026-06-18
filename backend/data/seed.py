"""Generate realistic sample datasets for Lens."""
import random
import csv
import os
from datetime import date, timedelta

random.seed(42)

GENRES = ["Action", "Comedy", "Drama", "Thriller", "Sci-Fi", "Romance", "Horror", "Documentary", "Animation", "Crime"]
COUNTRIES = ["United States", "United Kingdom", "Germany", "France", "Canada", "Australia", "Japan", "Brazil", "India", "Spain"]

FIRST_NAMES = ["Alice", "Bob", "Carlos", "Diana", "Ethan", "Fiona", "George", "Hannah", "Ivan", "Julia",
               "Kevin", "Laura", "Mike", "Nina", "Oscar", "Paula", "Quinn", "Rachel", "Steve", "Tina"]
LAST_NAMES  = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Wilson", "Moore",
               "Taylor", "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Young", "Lee"]

MOVIE_WORDS = ["The", "Dark", "Last", "Lost", "Fire", "Shadow", "Blue", "Night", "Gold", "Iron",
               "Storm", "Red", "Silent", "Broken", "Eternal", "Wild", "Steel", "Neon", "Hollow", "Silver"]
MOVIE_NOUNS = ["Knight", "House", "River", "Hour", "War", "City", "Mind", "Star", "Road", "Ocean",
               "Game", "Blood", "Light", "Line", "Rain", "Heart", "World", "Dream", "Code", "Edge"]


def gen_title():
    return f"The {random.choice(MOVIE_WORDS)} {random.choice(MOVIE_NOUNS)}"


def write_movies(path, n=5000):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["movie_id", "title", "year", "genre", "rating", "votes", "runtime_min", "budget_usd", "revenue_usd"])
        for i in range(1, n + 1):
            year    = random.randint(1975, 2024)
            rating  = round(random.gauss(6.5, 1.4), 1)
            rating  = max(1.0, min(10.0, rating))
            votes   = int(random.lognormvariate(10, 2))
            runtime = random.randint(75, 180)
            budget  = random.randint(1_000_000, 250_000_000)
            revenue = int(budget * random.lognormvariate(0.3, 1.0))
            w.writerow([i, gen_title(), year, random.choice(GENRES),
                        rating, votes, runtime, budget, revenue])


def write_customers(path, n=2000):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["customer_id", "name", "country", "joined_date", "loyalty_tier"])
        start = date(2015, 1, 1)
        tiers = ["Bronze", "Silver", "Gold", "Platinum"]
        for i in range(1, n + 1):
            name    = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
            country = random.choice(COUNTRIES)
            joined  = start + timedelta(days=random.randint(0, 3000))
            tier    = random.choices(tiers, weights=[50, 30, 15, 5])[0]
            w.writerow([i, name, country, joined.isoformat(), tier])


def write_orders(path, n=20000, n_customers=2000, n_movies=5000):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["order_id", "customer_id", "movie_id", "quantity", "price_usd", "order_date", "status"])
        start    = date(2018, 1, 1)
        statuses = ["completed", "completed", "completed", "refunded", "pending"]
        for i in range(1, n + 1):
            cid   = random.randint(1, n_customers)
            mid   = random.randint(1, n_movies)
            qty   = random.choices([1, 2, 3, 5], weights=[60, 25, 10, 5])[0]
            price = round(random.uniform(4.99, 24.99), 2)
            odate = start + timedelta(days=random.randint(0, 2000))
            w.writerow([i, cid, mid, qty, price, odate.isoformat(),
                        random.choice(statuses)])


if __name__ == "__main__":
    out = os.path.dirname(__file__)
    write_movies(os.path.join(out, "movies.csv"))
    write_customers(os.path.join(out, "customers.csv"))
    write_orders(os.path.join(out, "orders.csv"))
    print("Seed data written: movies.csv (5000), customers.csv (2000), orders.csv (20000)")
